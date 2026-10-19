/**
 * @file Scheduler.cpp
 * @brief Core Engine for Advanced Planning and Scheduling (APS) using Genetic Algorithm.
 *
 * @details
 * Job Shop Scheduling Problem (JSSP) with:
 * - Setup (changeover) time when the machine switches to a different order:
 *   from a setup matrix by product family (per machine, with a default for all machines),
 *   or from Operation::setupTimeMinutes when no matrix is given (benchmark mode).
 * - Due dates & Priorities: tardiness is counted once per order, at its last step.
 * - Release time: an operation never starts before its material is ready.
 * - Objective: C_max + weighted tardiness + weighted total setup time.
 *
 * @architecture
 * - Data Structure: opMatrix O(1) access to Operation by orderId and stepSequence.
 * - Representation: gen encoding of orderId, where the k-th appearance = step k.
 * - Crossover: Precedence Preservation Crossover (POX).
 *
 * @execution_flow
 * 0.1. Validate input, build opMatrix, init random population.
 * 0.2. Fitness: C_max + Tardiness Penalty (weighted by priority).
 * 0.3. Evolution: Elitism -> Tournament -> POX -> Mutate.
 * 0.4. Decode best chromosome to ScheduledTask with startTime and endTime.
 */

#include "../include/Scheduler.h"
#include <stdexcept>
#include <string>
#include <cmath>

using namespace std;

namespace {
    constexpr int kMaxId = 1000000;      // guard against huge allocations from bad data
    constexpr int kMaxFamily = 10000;
    constexpr size_t kMaxSetupCells = 5000000;
}

JobShopScheduler::JobShopScheduler(const SchedulerConfig& config) : cfg(config) {
    if (cfg.populationSize < 2) throw invalid_argument("populationSize must be >= 2");
    if (cfg.maxGenerations < 0) throw invalid_argument("maxGenerations must be >= 0");
    if (cfg.tournamentSize < 1) throw invalid_argument("tournamentSize must be >= 1");
    if (cfg.mutationRate < 0.0 || cfg.mutationRate > 1.0) throw invalid_argument("mutationRate must be in [0, 1]");
    if (cfg.weightSetup < 0) throw invalid_argument("weightSetup must be >= 0");

    unsigned int s = cfg.seed;
    if (s == 0) {
        random_device rd;
        s = rd();
    }
    rng.seed(s);
}

// 0.1 validate input + build opMatrix
void JobShopScheduler::buildModel(const vector<Operation>& operations,
                                  const vector<SetupEntry>& setupEntries,
                                  const vector<MachineWindow>& windows,
                                  const vector<MachineProfile>& profiles,
                                  const RescheduleContext& context) {
    maxOrderId = 0;
    maxMachineId = 0;
    numFamilies = 1;

    for (size_t i = 0; i < operations.size(); ++i) {
        const Operation& op = operations[i];
        const string where = "Operation #" + to_string(i) + " (order " + to_string(op.orderId) +
                             ", step " + to_string(op.stepSequence) + "): ";

        if (op.orderId < 0 || op.orderId > kMaxId) throw invalid_argument(where + "orderId out of range");
        if (op.machineId < 0 || op.machineId > kMaxId) throw invalid_argument(where + "machineId out of range");
        if (op.stepSequence <= 0 || op.stepSequence > kMaxId) throw invalid_argument(where + "stepSequence must be >= 1");
        if (op.processingTimeMinutes < 0) throw invalid_argument(where + "processing time must be >= 0");
        if (op.setupTimeMinutes < 0) throw invalid_argument(where + "setup time must be >= 0");
        if (op.releaseTimeMinutes < 0) throw invalid_argument(where + "release time must be >= 0");
        if (op.familyId < 0 || op.familyId > kMaxFamily) throw invalid_argument(where + "familyId out of range");

        maxOrderId = max(maxOrderId, op.orderId);
        maxMachineId = max(maxMachineId, op.machineId);
        numFamilies = max(numFamilies, op.familyId + 1);
    }

    for (size_t i = 0; i < setupEntries.size(); ++i) {
        const SetupEntry& e = setupEntries[i];
        const string where = "Setup entry #" + to_string(i) + ": ";
        if (e.machineId < -1 || e.machineId > kMaxId) throw invalid_argument(where + "machineId out of range");
        if (e.fromFamily < 0 || e.fromFamily > kMaxFamily) throw invalid_argument(where + "fromFamily out of range");
        if (e.toFamily < 0 || e.toFamily > kMaxFamily) throw invalid_argument(where + "toFamily out of range");
        if (e.minutes < 0) throw invalid_argument(where + "minutes must be >= 0");
        numFamilies = max(numFamilies, max(e.fromFamily, e.toFamily) + 1);
    }

    opMatrix.assign(maxOrderId + 1, vector<Operation>());
    familyOfOrder.assign(maxOrderId + 1, -1);
    for (const auto& op : operations) {
        if (familyOfOrder[op.orderId] == -1) {
            familyOfOrder[op.orderId] = op.familyId;
        } else if (familyOfOrder[op.orderId] != op.familyId) {
            throw invalid_argument("Order " + to_string(op.orderId) + ": operations belong to different product families");
        }

        vector<Operation>& steps = opMatrix[op.orderId];
        const size_t idx = static_cast<size_t>(op.stepSequence - 1);

        if (steps.size() <= idx) steps.resize(idx + 1); // new slots have machineId = -1
        if (steps[idx].machineId != -1) {
            throw invalid_argument("Order " + to_string(op.orderId) + ": duplicate step " + to_string(op.stepSequence));
        }
        steps[idx] = op;
    }

    orderIds.clear();
    for (int id = 0; id <= maxOrderId; ++id) {
        const vector<Operation>& steps = opMatrix[id];
        if (steps.empty()) continue;
        for (size_t k = 0; k < steps.size(); ++k) {
            if (steps[k].machineId == -1) {
                throw invalid_argument("Order " + to_string(id) + ": missing step " + to_string(k + 1));
            }
        }
        orderIds.push_back(id);
    }

    // resolve the matrix once: defaults (machineId = -1) first, then per-machine overrides
    useSetupMatrix = !setupEntries.empty();
    setupLookup.clear();
    if (useSetupMatrix) {
        const size_t machines = static_cast<size_t>(maxMachineId) + 1;
        const size_t families = static_cast<size_t>(numFamilies);
        if (machines * families * families > kMaxSetupCells) throw invalid_argument("setup matrix too large");

        setupLookup.assign(machines * families * families, 0);
        for (const auto& e : setupEntries) {
            if (e.machineId != -1) continue;
            for (size_t m = 0; m < machines; ++m) {
                setupLookup[(m * families + e.fromFamily) * families + e.toFamily] = e.minutes;
            }
        }
        for (const auto& e : setupEntries) {
            if (e.machineId < 0 || e.machineId > maxMachineId) continue; // machine without operations
            setupLookup[(static_cast<size_t>(e.machineId) * families + e.fromFamily) * families + e.toFamily] = e.minutes;
        }
    }

    mReadyTime.assign(maxMachineId + 1, 0);
    lastOrderOnMachine.assign(maxMachineId + 1, -1);
    oReadyTime.assign(maxOrderId + 1, 0);
    oStepTracker.assign(maxOrderId + 1, 0);
    pickedOrder.assign(maxOrderId + 1, 0);

    // === PHASE 1: efficiency rates ===
    machineRate.assign(maxMachineId + 1, 1.0);
    for (size_t i = 0; i < profiles.size(); ++i) {
        const MachineProfile& p = profiles[i];
        const string where = "Machine profile #" + to_string(i) + ": ";
        if (p.machineId < 0 || p.machineId > kMaxId) throw invalid_argument(where + "machineId out of range");
        if (!(p.efficiencyRate > 0.0) || p.efficiencyRate > 1.0) throw invalid_argument(where + "efficiencyRate must be in (0, 1]");
        if (p.machineId > maxMachineId) continue;  // machine without operations
        machineRate[p.machineId] = p.efficiencyRate;
    }

    // === PHASE 1: downtime windows (validate, sort, merge overlaps per machine) ===
    machineWindows.assign(maxMachineId + 1, {});
    for (size_t i = 0; i < windows.size(); ++i) {
        const MachineWindow& w = windows[i];
        const string where = "Window #" + to_string(i) + ": ";
        if (w.machineId < 0 || w.machineId > kMaxId) throw invalid_argument(where + "machineId out of range");
        if (w.startMinutes < 0) throw invalid_argument(where + "startMinutes must be >= 0");
        if (w.endMinutes <= w.startMinutes) throw invalid_argument(where + "endMinutes must be > startMinutes");
        if (w.machineId > maxMachineId) continue;
        machineWindows[w.machineId].push_back(w);
    }
    for (auto& ws : machineWindows) {
        if (ws.empty()) continue;
        sort(ws.begin(), ws.end(), [](const MachineWindow& a, const MachineWindow& b) {
            return a.startMinutes < b.startMinutes;
        });
        vector<MachineWindow> merged;
        for (const auto& w : ws) {
            if (!merged.empty() && w.startMinutes <= merged.back().endMinutes) {
                merged.back().endMinutes = max(merged.back().endMinutes, w.endMinutes);
            } else {
                merged.push_back(w);
            }
        }
        ws.swap(merged);
    }

        // === R1: validate reschedule context + build the schedulable gene pool ===
    rctx = context;
    if (rctx.nowMinutes < 0) throw invalid_argument("Reschedule context: nowMinutes must be >= 0");
    genesPerOrder.assign(maxOrderId + 1, 0);
    vector<int> done(maxOrderId + 1, 0);
    for (size_t i = 0; i < rctx.progress.size(); ++i) {
        const OrderProgress& pr = rctx.progress[i];
        const string where = "Progress #" + to_string(i) + ": ";
        if (pr.orderId < 0 || pr.orderId > maxOrderId || opMatrix[pr.orderId].empty())
            throw invalid_argument(where + "unknown order " + to_string(pr.orderId));
        if (pr.doneSteps < 0 || pr.doneSteps > static_cast<int>(opMatrix[pr.orderId].size()))
            throw invalid_argument(where + "doneSteps out of range");
        done[pr.orderId] = pr.doneSteps;
    }
    vector<char> hasFixed(maxOrderId + 1, 0);
    for (size_t i = 0; i < rctx.fixedTasks.size(); ++i) {
        const FixedTask& ft = rctx.fixedTasks[i];
        const string where = "FixedTask #" + to_string(i) + ": ";
        if (ft.orderId < 0 || ft.orderId > maxOrderId || opMatrix[ft.orderId].empty())
            throw invalid_argument(where + "unknown order");
        const vector<Operation>& steps = opMatrix[ft.orderId];
        if (ft.stepSequence < 1 || ft.stepSequence > static_cast<int>(steps.size()))
            throw invalid_argument(where + "stepSequence out of range");
        if (steps[ft.stepSequence - 1].machineId != ft.machineId)
            throw invalid_argument(where + "machine does not match the routing");
        if (ft.stepSequence != done[ft.orderId] + 1)
            throw invalid_argument(where + "fixed step must be the first not-completed step of the order");
        if (hasFixed[ft.orderId]) throw invalid_argument(where + "order already has a fixed task");
        if (ft.startMinutes < rctx.nowMinutes) throw invalid_argument(where + "startMinutes before nowMinutes");
        if (ft.endMinutes <= ft.startMinutes) throw invalid_argument(where + "endMinutes must be > startMinutes");
        hasFixed[ft.orderId] = 1;
    }
    // a fixed chunk may not intersect a downtime window (server must build both consistently)
    for (const auto& ft : rctx.fixedTasks) {
        for (const auto& w : machineWindows[ft.machineId]) {
            if (ft.startMinutes < w.endMinutes && ft.endMinutes > w.startMinutes) {
                throw invalid_argument("FixedTask on machine " + to_string(ft.machineId) +
                                       " intersects a downtime window");
            }
        }
    }
    // fixed chunks on the same machine may not overlap
    {
        vector<FixedTask> sortedFt = rctx.fixedTasks;
        sort(sortedFt.begin(), sortedFt.end(), [](const FixedTask& a, const FixedTask& b) {
            return a.machineId != b.machineId ? a.machineId < b.machineId
                                              : a.startMinutes < b.startMinutes;
        });
        for (size_t i = 1; i < sortedFt.size(); ++i) {
            if (sortedFt[i].machineId == sortedFt[i - 1].machineId &&
                sortedFt[i].startMinutes < sortedFt[i - 1].endMinutes) {
                throw invalid_argument("FixedTasks overlap on machine " + to_string(sortedFt[i].machineId));
            }
        }
    }
    for (size_t i = 0; i < rctx.lastOrderInit.size(); ++i) {
        const MachineLastOrder& lo = rctx.lastOrderInit[i];
        if (lo.machineId < 0 || lo.machineId > maxMachineId)
            throw invalid_argument("lastOrderInit #" + to_string(i) + ": machineId out of range");
        if (lo.orderId != -1 && (lo.orderId < 0 || lo.orderId > maxOrderId || opMatrix[lo.orderId].empty()))
            throw invalid_argument("lastOrderInit #" + to_string(i) + ": unknown order");
    }
    genePool.clear();
    for (int id : orderIds) {
        const int remaining = static_cast<int>(opMatrix[id].size()) - done[id] - (hasFixed[id] ? 1 : 0);
        if (remaining < 0) {
            throw invalid_argument("Order " + to_string(id) + ": context consumes more steps than the routing has");
        }
        genesPerOrder[id] = remaining;
        genePool.insert(genePool.end(), remaining, id);
    }
}

int JobShopScheduler::setupBefore(int machine, int prevOrderOnMachine, const Operation& op) const {
    if (prevOrderOnMachine == -1 || prevOrderOnMachine == op.orderId) return 0;
    if (!useSetupMatrix) return op.setupTimeMinutes;

    const size_t families = static_cast<size_t>(numFamilies);
    const size_t from = static_cast<size_t>(familyOfOrder[prevOrderOnMachine]);
    return setupLookup[(static_cast<size_t>(machine) * families + from) * families + op.familyId];
}

int JobShopScheduler::priorityWeight(int priority) const {
    if (priority >= 3) return cfg.weightPriority3;
    if (priority == 2) return cfg.weightPriority2;
    return cfg.weightPriority1;
}

// smallest t >= earliest such that [t, t+len) does not intersect any window
int JobShopScheduler::earliestFit(int machine, int earliest, int len) const {
    const vector<MachineWindow>& ws = machineWindows[machine];
    for (const auto& w : ws) {
        if (w.endMinutes <= earliest) continue;
        if (earliest + len <= w.startMinutes) break;
        earliest = w.endMinutes;
    }
    return earliest;
}

// ceil(minutes / rate) with epsilon guard for float artifacts
int JobShopScheduler::effectiveTime(int machine, int minutes) const {
    const double rate = machineRate[machine];
    if (rate >= 1.0) return minutes;
    return static_cast<int>(ceil(static_cast<double>(minutes) / rate - 1e-9));
}

// 0.2 / 0.4 genes -> schedule, C_max + Tardiness Penalty. out != nullptr also records the tasks.
ScheduleStats JobShopScheduler::decode(const vector<int>& genes, vector<ScheduledTask>* out) {
    fill(mReadyTime.begin(), mReadyTime.end(), 0);
    fill(lastOrderOnMachine.begin(), lastOrderOnMachine.end(), -1);
    fill(oReadyTime.begin(), oReadyTime.end(), 0);
    fill(oStepTracker.begin(), oStepTracker.end(), 0);

    ScheduleStats s;

        // === R1: seed scratch from the reschedule context (empty context = classic mode) ===
    for (const auto& lo : rctx.lastOrderInit) lastOrderOnMachine[lo.machineId] = lo.orderId;
    for (const auto& pr : rctx.progress) oStepTracker[pr.orderId] = pr.doneSteps;
    for (const auto& ft : rctx.fixedTasks) {
        oStepTracker[ft.orderId] = ft.stepSequence;      // the fixed step is consumed
        lastOrderOnMachine[ft.machineId] = ft.orderId;   // family continuity for the next setup
        if (ft.endMinutes > mReadyTime[ft.machineId]) mReadyTime[ft.machineId] = ft.endMinutes;
        if (ft.endMinutes > oReadyTime[ft.orderId]) oReadyTime[ft.orderId] = ft.endMinutes;
        if (ft.endMinutes > s.makespan) s.makespan = ft.endMinutes;
        if (out) {
            ScheduledTask task;
            task.orderId = ft.orderId;
            task.machineId = ft.machineId;
            task.stepSequence = ft.stepSequence;
            task.startTime = ft.startMinutes;
            task.endTime = ft.endMinutes;
            task.setupStartTime = ft.startMinutes;
            task.setupMinutes = 0; // resume = no re-setup (decided); in-progress = setup already consumed
            task.status = 1;
            out->push_back(task);
        }
    }
    for (int m = 0; m <= maxMachineId; ++m) {
        if (mReadyTime[m] < rctx.nowMinutes) mReadyTime[m] = rctx.nowMinutes; // nothing starts before T
    }

    for (int id : genes) {
        const size_t step = static_cast<size_t>(oStepTracker[id]++);
        if (step >= opMatrix[id].size()) {
            throw logic_error("decode: chromosome has more genes than steps for order " + to_string(id));
        }

        const Operation& op = opMatrix[id][step];
        const int m = op.machineId;

        // setup may overlap with the time the order is still waiting for its previous step / material
        const int setup = setupBefore(m, lastOrderOnMachine[m], op);
        const int proc = op.timeIsMachineMinutes ? op.processingTimeMinutes
                                                 : effectiveTime(m, op.processingTimeMinutes);
        // setup placed first; a window MAY fall in the idle gap between setup-end and proc-start
        const int setupStart = earliestFit(m, mReadyTime[m], setup);
        const int earliestProc = max(max(setupStart + setup, oReadyTime[id]), op.releaseTimeMinutes);
        const int startTime = earliestFit(m, earliestProc, proc);
        const int endTime = startTime + proc;
        mReadyTime[m] = endTime;
        oReadyTime[id] = endTime;


        lastOrderOnMachine[m] = id;

        if (endTime > s.makespan) s.makespan = endTime;
        s.totalSetupMinutes += setup;

        // tardiness only when the order completes (last step)
        if (step + 1 == opMatrix[id].size()) {
            const int tardiness = max(0, endTime - op.dueDateMinutes);
            if (tardiness > 0) {
                s.lateOrders++;
                s.totalTardiness += tardiness;
                s.priorityPenalty += static_cast<long long>(tardiness) * priorityWeight(op.priority);
            }
        }

        if (out) {
            ScheduledTask task;
            task.orderId = id;
            task.machineId = m;
            task.stepSequence = static_cast<int>(step) + 1;
            task.startTime = startTime;
            task.endTime = endTime;
            task.setupStartTime = setupStart;
            task.setupMinutes = setup;
            out->push_back(task);
        }
    }

    s.fitness = static_cast<long long>(s.makespan) + s.priorityPenalty +
                static_cast<long long>(cfg.weightSetup) * s.totalSetupMinutes;
    return s;
}

// 0.1 F0
vector<Chromosome> JobShopScheduler::initPopulation() {
    const vector<int>& baseGenes = genePool;

    vector<Chromosome> pop(cfg.populationSize);
    for (auto& chrom : pop) {
        chrom.genes = baseGenes;
        shuffle(chrom.genes.begin(), chrom.genes.end(), rng);
        chrom.fitness = decode(chrom.genes, nullptr).fitness;
    }
    return pop;
}

// 0. setup and run GA
vector<ScheduledTask> JobShopScheduler::schedule(const vector<Operation>& operations,
                                                  const vector<SetupEntry>& setupEntries,
                                                  const vector<MachineWindow>& windows,
                                                  const vector<MachineProfile>& profiles,
                                                  const RescheduleContext& context) {   
    stats = ScheduleStats();
    baselines.clear();
    if (operations.empty()) return {};
    buildModel(operations, setupEntries, windows, profiles, context);
    if (genePool.empty()) return {}; // everything is already done at snapshot time

    auto byFitness = [](const Chromosome& a, const Chromosome& b) { return a.fitness < b.fitness; };

    vector<Chromosome> pop = initPopulation();
    sort(pop.begin(), pop.end(), byFitness);
    Chromosome best = pop[0];

    // 0.3 loop GA (sorted and compared with best right after each generation, including the last one)
    for (int gen = 0; gen < cfg.maxGenerations; ++gen) {
        vector<Chromosome> nextGen;
        nextGen.reserve(pop.size());

        // Elitism
        nextGen.push_back(pop[0]);

        while (static_cast<int>(nextGen.size()) < cfg.populationSize) {
            const Chromosome& p1 = tourSelection(pop);
            const Chromosome& p2 = tourSelection(pop);

            Chromosome child = crossoverPOX(p1, p2);
            mutate(child);
            child.fitness = decode(child.genes, nullptr).fitness;

            nextGen.push_back(move(child));
        }

        pop.swap(nextGen);
        sort(pop.begin(), pop.end(), byFitness);
        if (pop[0].fitness < best.fitness) best = pop[0];
    }

    // 0.4 - end, build schedule from best
    vector<ScheduledTask> res;
    res.reserve(best.genes.size());
    stats = decode(best.genes, &res);
    computeBaselines();
    return res;
}

// baselines: dispatch whole orders one after another (rule 0: FIFO by material ready time, rule 1: EDD by due date)
void JobShopScheduler::computeBaselines() {
    baselines.clear();
    for (int rule = 0; rule < 2; ++rule) {
        vector<int> ids;
        for (int id : orderIds) if (genesPerOrder[id] > 0) ids.push_back(id);
        sort(ids.begin(), ids.end(), [&](int a, int b) {
            if (rule == 1) {
                const int dueA = opMatrix[a].back().dueDateMinutes;
                const int dueB = opMatrix[b].back().dueDateMinutes;
                if (dueA != dueB) return dueA < dueB;
            }
            const int relA = opMatrix[a].front().releaseTimeMinutes;
            const int relB = opMatrix[b].front().releaseTimeMinutes;
            if (relA != relB) return relA < relB;
            return a < b;
        });

        vector<int> genes;
        for (int id : ids) genes.insert(genes.end(), genesPerOrder[id], id);

        BaselineResult result;
        result.name = (rule == 0) ? "FIFO" : "EDD";
        result.stats = decode(genes, nullptr);
        baselines.push_back(result);
    }
}

// 0.3
const Chromosome& JobShopScheduler::tourSelection(const vector<Chromosome>& p) {
    uniform_int_distribution<int> dist(0, static_cast<int>(p.size()) - 1);

    const Chromosome* best = &p[dist(rng)];
    for (int i = 1; i < cfg.tournamentSize; ++i) {
        const Chromosome* competitor = &p[dist(rng)];
        if (competitor->fitness < best->fitness) best = competitor;
    }
    return *best;
}

// 0.3
Chromosome JobShopScheduler::crossoverPOX(const Chromosome& p1, const Chromosome& p2) {
    const size_t numGenes = p1.genes.size();

    Chromosome child;
    child.genes.assign(numGenes, -1);

    bernoulli_distribution coin(0.5);
    fill(pickedOrder.begin(), pickedOrder.end(), 0);
    for (int id : orderIds) {
        pickedOrder[id] = coin(rng) ? 1 : 0;
    }

    for (size_t i = 0; i < numGenes; ++i) {
        if (pickedOrder[p1.genes[i]]) child.genes[i] = p1.genes[i];
    }

    size_t j = 0;
    for (size_t i = 0; i < numGenes; ++i) {
        if (child.genes[i] != -1) continue;
        while (j < numGenes && pickedOrder[p2.genes[j]]) ++j;
        if (j >= numGenes) throw runtime_error("Fatal Error: Crossover POX failed.");
        child.genes[i] = p2.genes[j++];
    }
    return child;
}

// 0.3
void JobShopScheduler::mutate(Chromosome& chrom) {
    uniform_real_distribution<double> probDist(0.0, 1.0);
    uniform_int_distribution<int> indexDist(0, static_cast<int>(chrom.genes.size()) - 1);

    for (size_t i = 0; i < chrom.genes.size(); ++i) {
        if (probDist(rng) < cfg.mutationRate) {
            swap(chrom.genes[i], chrom.genes[indexDist(rng)]);
        }
    }
}