/**
 * @file Scheduler.cpp
 * @brief Core Engine for Advanced Planning and Scheduling (APS) using Genetic Algorithm.
 * 
 * @details
 * Module prevents the "Job Shop Scheduling Problem" (JSSP) with constraints such as:
 * - Sequence-dependent Setup Times.
 * - Due dates & Priorities.
 * 
 * @architecture
 * - Data Structure: opMatrix O(1) access to Operation by orderId and stepSequence.
 * - Representation: gen encoding of orderId, where the number of appearances = stepSequence.
 * - Crossover: using Precedence Preservation Crossover (POX).
 * 
 * @execution_flow
 * 0.1. Init: random F0 (initPopulation).
 * 0.2. Fitness: C_max + Tardiness Penalty (weighted by priority).
 * 0.3. Evolution: Tournament -> POX -> Mutate.
 * 0.4. Decode: convert best chromosome to ScheduledTask with startTime and endTime.
 */

#include "../include/Scheduler.h"
#include <stdexcept>

using namespace std;

// 0. setup and run GA
vector<ScheduledTask> JobShopScheduler::schedule(const vector<Operation>& operations) {
    if (operations.empty()) return {};

    maxOrderId = 0;
    maxMachineId = 0;
    
    for (const auto& op : operations) {
        if (op.orderId > maxOrderId) maxOrderId = op.orderId;
        if (op.machineId > maxMachineId) maxMachineId = op.machineId;
    }

    opMatrix.assign(maxOrderId + 1, vector<Operation>());
    for (const auto& op : operations) {
        if (op.stepSequence <= 0) continue; // invalid

        if (opMatrix[op.orderId].size() < op.stepSequence) opMatrix[op.orderId].resize(op.stepSequence); // id 1, size 2 but step > 2 -> size = step

        opMatrix[op.orderId][op.stepSequence - 1] = op;
    }

    vector<Chromosome> p = initPopulation(operations); // start 0.1
    Chromosome bestFitness = p[0];


    // 0.3 loop GA
    for (int gen = 0; gen < maxGenerations; ++gen) {
        vector<Chromosome> nextGen; 
        
        sort(p.begin(), p.end(), [](const Chromosome& a, const Chromosome& b) {
            return a.fitness < b.fitness;
        });
        
        // Elitism
        nextGen.push_back(p[0]); 
        
        if (p[0].fitness < bestFitness.fitness) bestFitness = p[0];

        while (nextGen.size() < populationSize) {
            Chromosome p1 = tourSelection(p);
            Chromosome p2 = tourSelection(p);
            
            Chromosome child = crossoverPOX(p1, p2);
            mutate(child);
            calFitness(child);
            
            nextGen.push_back(child);
        }
        p = nextGen; 
    }
    
    // 0.4 - end, cal schedule from bestFitness
    vector<ScheduledTask> res;
    vector<int> mReadyTime(maxMachineId + 1, 0); 
    vector<int> oReadyTime(maxOrderId + 1, 0);   
    vector<int> oStepTracker(maxOrderId + 1, 0); 
    vector<int> lastOrderOnMachine(maxMachineId + 1, -1);

    for (int Id : bestFitness.genes) {
        int currStep = oStepTracker[Id];
        
        if (currStep >= opMatrix[Id].size()) continue; 
        
        oStepTracker[Id]++;
        const Operation& currOp = opMatrix[Id][currStep];
        if (currOp.machineId == -1) continue;

        int addedSetup = 0;
        if (lastOrderOnMachine[currOp.machineId] != -1 && lastOrderOnMachine[currOp.machineId] != Id) {
            addedSetup = currOp.setupTimeMinutes;
        }

        int startTime = max(mReadyTime[currOp.machineId] + addedSetup, oReadyTime[Id]);
        int endTime = startTime + currOp.processingTimeMinutes;

        mReadyTime[currOp.machineId] = endTime;
        oReadyTime[Id] = endTime;
        lastOrderOnMachine[currOp.machineId] = Id;

        ScheduledTask task;
        task.orderId = Id;
        task.machineId = currOp.machineId;
        task.stepSequence = currStep + 1;
        task.startTime = startTime;
        task.endTime = endTime;
        
        res.push_back(task);
    }

    return res;
}

// 0.2 O(1) C_max + Tardiness Penalty
int JobShopScheduler::calFitness(Chromosome& chrom) {
    vector<int> mReadyTime(maxMachineId + 1, 0); 
    vector<int> oReadyTime(maxOrderId + 1, 0);   
    vector<int> oStepTracker(maxOrderId + 1, 0);
    vector<int> lastOrderOnMachine(maxMachineId + 1, -1); 

    int makespan = 0;        
    long long priorityPenalty = 0; 

    for (int Id : chrom.genes) {
        int currStep = oStepTracker.at(Id);
        if (currStep >= opMatrix.at(Id).size()) continue;

        const Operation& currOp = opMatrix.at(Id).at(currStep);
        oStepTracker.at(Id)++;
        
        if (currOp.machineId == -1 || currOp.machineId > maxMachineId) continue;
        if (currOp.processingTimeMinutes <= 0) continue;

        int addedSetup = 0;
        if (lastOrderOnMachine.at(currOp.machineId) != -1 && lastOrderOnMachine.at(currOp.machineId) != Id) {
            addedSetup = currOp.setupTimeMinutes; 
        }

        int startTime = max(mReadyTime.at(currOp.machineId) + addedSetup, oReadyTime.at(Id));
        int endTime = startTime + currOp.processingTimeMinutes;

        mReadyTime.at(currOp.machineId) = endTime;
        oReadyTime.at(Id) = endTime;
        lastOrderOnMachine.at(currOp.machineId) = Id;

        if (endTime > makespan) {
            makespan = endTime;
        }

        int tardiness = max(0, endTime - currOp.dueDateMinutes);
        if (tardiness > 0) {
            // (P1 x10, P2 x50, P3 x200)
            int weight = (currOp.priority == 3) ? 200 : (currOp.priority == 2 ? 50 : 10);
            priorityPenalty += (tardiness * weight);
        }
    }
    
    chrom.fitness = makespan + priorityPenalty;
    return chrom.fitness;
}

// 0.1 F0
vector<Chromosome> JobShopScheduler::initPopulation(const vector<Operation>& operations) {
    vector<Chromosome> p(populationSize);
    vector<int> baseGenes;
    baseGenes.reserve(operations.size());
    for (const auto& op : operations) {
        baseGenes.push_back(op.orderId);
    }

    for (int i = 0; i < populationSize; ++i) {
        Chromosome chrom;
        chrom.genes = baseGenes; 
        shuffle(chrom.genes.begin(), chrom.genes.end(), rng); 
        calFitness(chrom);
        p[i] = chrom;
    }
    return p;
}

// 0.3
Chromosome JobShopScheduler::tourSelection(const vector<Chromosome>& p) {
    uniform_int_distribution<> dist(0, populationSize - 1);

    Chromosome best = p[dist(rng)];
    for (int i = 1; i < tournamentSize; ++i) {
        const Chromosome& competitor = p[dist(rng)];
        if (competitor.fitness < best.fitness) {
            best = competitor;
        }
    }
    return best;
}

// 0.3
Chromosome JobShopScheduler::crossoverPOX(const Chromosome& p1, const Chromosome& p2) {
    Chromosome child;
    int numGenes = p1.genes.size();
    child.genes.assign(numGenes, -1);

    unordered_set<int> uniqueOrders;
    for (int gene : p1.genes) {
        uniqueOrders.insert(gene);
    }

    uniform_int_distribution<> dist(0, 1);
    
    unordered_set<int> set1;
    for (int orderId : uniqueOrders) {
        if (dist(rng) == 1) {
            set1.insert(orderId);
        }
    }

    for (int i = 0; i < numGenes; ++i) {
        if (set1.count(p1.genes[i])) {
            child.genes[i] = p1.genes[i];
        }
    }

    int p2Index = 0;
    for (int i = 0; i < numGenes; ++i) {
        if (child.genes[i] == -1) {
            while (p2Index < numGenes && set1.count(p2.genes[p2Index])) {
                p2Index++;
            }
            if (p2Index < numGenes) {
                child.genes[i] = p2.genes[p2Index];
                p2Index++;
            } else {
                throw runtime_error("Fatal Error: Crossover POX failed.");
            }
        }
    }
    return child; 
}

// 0.3
void JobShopScheduler::mutate(Chromosome& chrom) {
    uniform_real_distribution<> probDist(0.0, 1.0);
    uniform_int_distribution<> indexDist(0, static_cast<int>(chrom.genes.size()) - 1);

    for (size_t i = 0; i < chrom.genes.size(); ++i) {
        if (probDist(rng) < mutationRate) {
            int swapIdx = indexDist(rng);
            swap(chrom.genes[i], chrom.genes[swapIdx]);
        }
    }
}