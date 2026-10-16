/**
 * @file Scheduler.cpp
 * @brief Core Engine for Advanced Planning and Scheduling (APS) using Genetic Algorithm.
 *
 * @details
 * Job Shop Scheduling Problem (JSSP) with:
 * - Setup (changeover) time when the machine switches to a different order.
 * - Due dates & Priorities: tardiness is counted once per order, at its last step.
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

using namespace std;

namespace {
    constexpr int kMaxId = 1000000; // guard against huge allocations from bad data
}

JobShopScheduler::JobShopScheduler(const SchedulerConfig& config) : cfg(config) {
    if (cfg.populationSize < 2) throw invalid_argument("populationSize must be >= 2");
    if (cfg.maxGenerations < 0) throw invalid_argument("maxGenerations must be >= 0");
    if (cfg.tournamentSize < 1) throw invalid_argument("tournamentSize must be >= 1");
    if (cfg.mutationRate < 0.0 || cfg.mutationRate > 1.0) throw invalid_argument("mutationRate must be in [0, 1]");

    unsigned int s = cfg.seed;
    if (s == 0) {
        random_device rd;
        s = rd();
    }
    rng.seed(s);
}

// 0.1 validate input + build opMatrix
void JobShopScheduler::buildModel(const vector<Operation>& operations) {
    maxOrderId = 0;
    maxMachineId = 0;

    for (size_t i = 0; i < operations.size(); ++i) {
        const Operation& op = operations[i];
        const string where = "Operation #" + to_string(i) + " (order " + to_string(op.orderId) +
                             ", step " + to_string(op.stepSequence) + "): ";

        if (op.orderId < 0 || op.orderId > kMaxId) throw invalid_argument(where + "orderId out of range");
        if (op.machineId < 0 || op.machineId > kMaxId) throw invalid_argument(where + "machineId out of range");
        if (op.stepSequence <= 0 || op.stepSequence > kMaxId) throw invalid_argument(where + "stepSequence must be >= 1");
        if (op.processingTimeMinutes < 0) throw invalid_argument(where + "processing time must be >= 0");
        if (op.setupTimeMinutes < 0) throw invalid_argument(where + "setup time must be >= 0");

        maxOrderId = max(maxOrderId, op.orderId);
        maxMachineId = max(maxMachineId, op.machineId);
    }

    opMatrix.assign(maxOrderId + 1, vector<Operation>());
    for (const auto& op : operations) {
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

    mReadyTime.assign(maxMachineId + 1, 0);
    lastOrderOnMachine.assign(maxMachineId + 1, -1);
    oReadyTime.assign(maxOrderId + 1, 0);
    oStepTracker.assign(maxOrderId + 1, 0);
    pickedOrder.assign(maxOrderId + 1, 0);
}

int JobShopScheduler::setupBefore(int prevOrderOnMachine, const Operation& op) const {
    if (prevOrderOnMachine == -1 || prevOrderOnMachine == op.orderId) return 0;
    return op.setupTimeMinutes;
}

int JobShopScheduler::priorityWeight(int priority) const {
    if (priority >= 3) return cfg.weightPriority3;
    if (priority == 2) return cfg.weightPriority2;
    return cfg.weightPriority1;
}

// 0.2 / 0.4 genes -> schedule, C_max + Tardiness Penalty. out != nullptr also records the tasks.
ScheduleStats JobShopScheduler::decode(const vector<int>& genes, vector<ScheduledTask>* out) {
    fill(mReadyTime.begin(), mReadyTime.end(), 0);
    fill(lastOrderOnMachine.begin(), lastOrderOnMachine.end(), -1);
    fill(oReadyTime.begin(), oReadyTime.end(), 0);
    fill(oStepTracker.begin(), oStepTracker.end(), 0);

    ScheduleStats s;

    for (int id : genes) {
        const size_t step = static_cast<size_t>(oStepTracker[id]++);
        if (step >= opMatrix[id].size()) {
            throw logic_error("decode: chromosome has more genes than steps for order " + to_string(id));
        }

        const Operation& op = opMatrix[id][step];
        const int m = op.machineId;

        // setup may overlap with the time the order is still waiting for its previous step
        const int setup = setupBefore(lastOrderOnMachine[m], op);
        const int startTime = max(mReadyTime[m] + setup, oReadyTime[id]);
        const int endTime = startTime + op.processingTimeMinutes;

        mReadyTime[m] = endTime;
        oReadyTime[id] = endTime;
        lastOrderOnMachine[m] = id;

        if (endTime > s.makespan) s.makespan = endTime;

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
            out->push_back(task);
        }
    }

    s.fitness = static_cast<long long>(s.makespan) + s.priorityPenalty;
    return s;
}

// 0.1 F0
vector<Chromosome> JobShopScheduler::initPopulation() {
    vector<int> baseGenes;
    for (int id : orderIds) {
        baseGenes.insert(baseGenes.end(), opMatrix[id].size(), id);
    }

    vector<Chromosome> pop(cfg.populationSize);
    for (auto& chrom : pop) {
        chrom.genes = baseGenes;
        shuffle(chrom.genes.begin(), chrom.genes.end(), rng);
        chrom.fitness = decode(chrom.genes, nullptr).fitness;
    }
    return pop;
}

// 0. setup and run GA
vector<ScheduledTask> JobShopScheduler::schedule(const vector<Operation>& operations) {
    stats = ScheduleStats();
    if (operations.empty()) return {};

    buildModel(operations);

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
    return res;
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