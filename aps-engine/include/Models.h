#pragma once
#include <vector>

// input
struct Operation {
    int orderId = -1;
    int priority = 1;         // 1: Normal, 2: High, 3: Extremely High
    int dueDateMinutes = 0;   // 
    int setupTimeMinutes = 0; // 
    int machineId = -1;
    int stepSequence = -1; // in order 
    int processingTimeMinutes = 0;
};

// output
struct ScheduledTask {
    int orderId;
    int machineId;
    int stepSequence;
    int startTime; 
    int endTime; // endTime > startTime
};

struct Chromosome {
    std::vector<int> genes; 
    // genes present ID of order, times appear in genes = stepSequence of that order
    // ex: genes = [1, 2, 1, 3, 2] => order 1 has stepSequence = 2, order 2 has stepSequence = 2, order 3 has stepSequence = 1
    
    int fitness = -1; // C_max, lower is better
};