#pragma once
#include "Models.h"
#include <vector>
#include <algorithm>
#include <random>

struct SchedulerConfig {
    // total time run = populationSize * maxGenerations * (step);
    // 100 * 1000 * 50 = 5,000,000 steps (current times for LA 01-20 in g++: min 1.8s, max 5.1s) in node.js = 1/10;
    int populationSize = 50;
    int maxGenerations = 1000;
    int tournamentSize = 3;     // randomly select 3, pick the best to be parent
    double mutationRate = 0.01; // per gene (1 / total - LA 10 = 100)
    unsigned int seed = 0;      // 0 = random seed

    // tardiness penalty = minutes late * weight
    int weightPriority1 = 10;
    int weightPriority2 = 50;
    int weightPriority3 = 200;
};

class JobShopScheduler {
public:
    explicit JobShopScheduler(const SchedulerConfig& config = SchedulerConfig());

    // throws std::invalid_argument on invalid input
    std::vector<ScheduledTask> schedule(const std::vector<Operation>& operations);

    // stats of the schedule returned by the last schedule() call
    const ScheduleStats& lastStats() const { return stats; }

private:
    SchedulerConfig cfg;
    std::mt19937 rng;

    int maxOrderId = 0;
    int maxMachineId = 0;

    // O(1): opMatrix[orderId][stepSequence - 1]
    std::vector<std::vector<Operation>> opMatrix;
    std::vector<int> orderIds;

    // scratch buffers reused by decode / crossover
    std::vector<int> mReadyTime;
    std::vector<int> oReadyTime;
    std::vector<int> oStepTracker;
    std::vector<int> lastOrderOnMachine;
    std::vector<char> pickedOrder;

    ScheduleStats stats;

    void buildModel(const std::vector<Operation>& operations);
    std::vector<Chromosome> initPopulation();

    // single place that turns genes into a schedule (used by fitness and final output)
    ScheduleStats decode(const std::vector<int>& genes, std::vector<ScheduledTask>* out);

    int setupBefore(int prevOrderOnMachine, const Operation& op) const;
    int priorityWeight(int priority) const;

    const Chromosome& tourSelection(const std::vector<Chromosome>& population);
    Chromosome crossoverPOX(const Chromosome& p1, const Chromosome& p2);
    void mutate(Chromosome& chrom);
};