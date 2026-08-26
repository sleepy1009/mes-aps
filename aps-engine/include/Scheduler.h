#pragma once
#include "Models.h"
#include <vector>
#include <unordered_set>
#include <algorithm>
#include <random>

class JobShopScheduler {
private:
    // total time run = populationSize * maxGenerations * (step);
    // 100 * 1000 * 50 = 5,000,000 steps (current times for LA 01-20 in g++: min 1.8s, max 5.1s) in node.js = 1/10;
    // gap [01 - 15] < 5%, [15 - 20] 5 - 8%
    int populationSize = 50;  // scheduler per time
    int maxGenerations = 1000; // F1000
    int tournamentSize = 3; // randomly select 3, pick the best to be p
    double mutationRate = 0.05;

    std::mt19937 rng;

    int maxOrderId = 0;
    int maxMachineId = 0;
    
    // O(1): opMatrix[orderId][stepSequence - 1]
    std::vector<std::vector<Operation>> opMatrix; 

    std::vector<Chromosome> initPopulation(const std::vector<Operation>& op); // get bad 100 F0
    int calFitness(Chromosome& chrom); // C_max

    Chromosome tourSelection(const std::vector<Chromosome>& population);
    Chromosome crossoverPOX(const Chromosome& p1, const Chromosome& p2);
    void mutate(Chromosome& chrom);

public:
    JobShopScheduler() {
        std::random_device rd;
        rng = std::mt19937(rd());
    }
    std::vector<ScheduledTask> schedule(const std::vector<Operation>& op);
};