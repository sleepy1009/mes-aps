#pragma once
#include "Models.h"
#include <vector>
#include <algorithm>
#include <random>

struct SchedulerConfig {
    int populationSize = 50;
    int maxGenerations = 1000;
    int tournamentSize = 3;     // randomly select 3, pick the best to be parent
    double mutationRate = 0.01; // per gene
    unsigned int seed = 0;      // 0 = random seed

    // tardiness penalty = minutes late * weight
    int weightPriority1 = 10;
    int weightPriority2 = 50;
    int weightPriority3 = 200;

    // each minute of changeover costs this many minutes of makespan; 0 = setup only matters through makespan
    int weightSetup = 1;
};

class JobShopScheduler {
public:
    explicit JobShopScheduler(const SchedulerConfig& config = SchedulerConfig());

    // throws std::invalid_argument on invalid input
    // setupEntries empty -> legacy mode: Operation::setupTimeMinutes is used
    // setupEntries given -> changeover time = matrix[machine][previous order's family][this order's family]
    std::vector<ScheduledTask> schedule(const std::vector<Operation>& operations,
                                        const std::vector<SetupEntry>& setupEntries = std::vector<SetupEntry>(),
                                        const std::vector<MachineWindow>& windows = std::vector<MachineWindow>(),
                                        const std::vector<MachineProfile>& profiles = std::vector<MachineProfile>(),
                                        const RescheduleContext& context = RescheduleContext());

    // stats of the schedule returned by the last schedule() call
    const ScheduleStats& lastStats() const { return stats; }

    // FIFO (by material ready time) and EDD (earliest due date): whole orders dispatched one after another
    const std::vector<BaselineResult>& lastBaselines() const { return baselines; }

private:
    SchedulerConfig cfg;
    std::mt19937 rng;

    int maxOrderId = 0;
    int maxMachineId = 0;

    // O(1): opMatrix[orderId][stepSequence - 1]
    std::vector<std::vector<Operation>> opMatrix;
    std::vector<int> orderIds;

    int numFamilies = 1;
    bool useSetupMatrix = false;
    std::vector<int> familyOfOrder;
    std::vector<int> setupLookup; // [machine][fromFamily][toFamily], defaults already resolved

    // scratch buffers reused by decode / crossover
    std::vector<int> mReadyTime;
    std::vector<int> oReadyTime;
    std::vector<int> oStepTracker;
    std::vector<int> lastOrderOnMachine;
    std::vector<char> pickedOrder;

    ScheduleStats stats;
    std::vector<BaselineResult> baselines;

    std::vector<std::vector<MachineWindow>> machineWindows;
    std::vector<double> machineRate;

    // === R1 ===
    RescheduleContext rctx;
    std::vector<int> genePool;       // genes of the steps that are still schedulable
    std::vector<int> genesPerOrder;  // remaining step count per order (baselines reuse this)

    void buildModel(const std::vector<Operation>& operations,
                    const std::vector<SetupEntry>& setupEntries,
                    const std::vector<MachineWindow>& windows,
                    const std::vector<MachineProfile>& profiles,
                    const RescheduleContext& context);


    int earliestFit(int machine, int earliest, int len) const;
    int effectiveTime(int machine, int minutes) const;

    // single place that turns genes into a schedule (used by fitness and final output)
    ScheduleStats decode(const std::vector<int>& genes, std::vector<ScheduledTask>* out);

    void computeBaselines();

    int setupBefore(int machine, int prevOrderOnMachine, const Operation& op) const;
    int priorityWeight(int priority) const;


    std::vector<Chromosome> initPopulation();
    const Chromosome& tourSelection(const std::vector<Chromosome>& population);
    Chromosome crossoverPOX(const Chromosome& p1, const Chromosome& p2);
    void mutate(Chromosome& chrom);
};