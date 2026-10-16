#pragma once
#include <vector>

// input
struct Operation {
    int orderId = -1;
    int priority = 1;         // 1: Normal, 2: High, 3: Extremely High
    int dueDateMinutes = 0;   // order due date, taken from the order's last step
    int setupTimeMinutes = 0; // added only different order
    int machineId = -1;       // -1 = empty slot (internal use)
    int stepSequence = -1;    // 1-based, in order
    int processingTimeMinutes = 0;
};

// output
struct ScheduledTask {
    int orderId;
    int machineId;
    int stepSequence;
    int startTime;
    int endTime; // endTime >= startTime
};

struct ScheduleStats {
    int makespan = 0;               // C_max
    long long totalTardiness = 0;   // minutes, counted once per order (last step)
    long long priorityPenalty = 0;  // sum of tardiness * priority weight
    int lateOrders = 0;
    long long fitness = 0;          // makespan + priorityPenalty, lower is better
};

struct Chromosome {
    std::vector<int> genes;
    // genes present ID of order, k-th occurrence of an ID = step k of that order
    // ex: genes = [1, 2, 1, 3, 2] => order 1 has 2 steps, order 2 has 2 steps, order 3 has 1 step

    long long fitness = -1; // lower is better
};