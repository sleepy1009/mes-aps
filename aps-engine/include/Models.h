#pragma once
#include <string>
#include <vector>

// input
struct Operation {
    int orderId = -1;
    int priority = 1;           // 1: Normal, 2: High, 3: Extremely High
    int releaseTimeMinutes = 0; // earliest start of this operation (material ready)
    int dueDateMinutes = 0;     // order due date, taken from the order's last step
    int setupTimeMinutes = 0;   // changeover time, used only when no setup matrix is given
    int familyId = 0;           // product family of the order (0-based), used with the setup matrix
    int machineId = -1;         // -1 = empty slot (internal use)
    int stepSequence = -1;      // 1-based, in order
    int processingTimeMinutes = 0;
    // true = processingTimeMinutes is already machine-effective minutes (reschedule of a
    // partially done operation); the efficiency rate must NOT scale it a second time
    bool timeIsMachineMinutes = false;
};

// changeover minutes when a machine switches from one product family to another
struct SetupEntry {
    int machineId = -1; // -1 = default for every machine, a specific machine overrides the default
    int fromFamily = 0;
    int toFamily = 0;
    int minutes = 0;
};

// output
struct ScheduledTask {
    int orderId;
    int machineId;
    int stepSequence;
    int startTime;
    int endTime; // endTime >= startTime
    int setupStartTime; // the machine starts the changeover here (= end of its previous operation)
    int setupMinutes;   // 0 if no changeover
    int status = 0;       // 0 = newly scheduled, 1 = fixed chunk (in-progress / resume)
};

struct ScheduleStats {
    int makespan = 0;               // C_max
    long long totalTardiness = 0;   // minutes, counted once per order (last step)
    long long priorityPenalty = 0;  // sum of tardiness * priority weight
    int lateOrders = 0;
    long long totalSetupMinutes = 0;
    long long fitness = 0;          // makespan + priorityPenalty + weightSetup * totalSetupMinutes, lower is better
};

// stats of a simple dispatching rule on the same data, used to show what the GA gains
struct BaselineResult {
    std::string name;
    ScheduleStats stats;
};

struct Chromosome {
    std::vector<int> genes;
    // genes present ID of order, k-th occurrence of an ID = step k of that order
    // ex: genes = [1, 2, 1, 3, 2] => order 1 has 2 steps, order 2 has 2 steps, order 3 has 1 step

    long long fitness = -1; // lower is better
};


// machine unavailable window (preventive maintenance or breakdown)
struct MachineWindow {
    int machineId = -1;
    int startMinutes = 0;
    int endMinutes = 0;
    int type = 0;  // 0 = PM, 1 = BREAKDOWN
};

// per-machine efficiency: effective_processing = ceil(nominal / rate)
struct MachineProfile {
    int machineId = -1;
    double efficiencyRate = 1.0;  // (0, 1]
};

// === R1: reactive rescheduling ===
// a chunk of an operation already running (or resuming after repair):
// [startMinutes, endMinutes) on machineId is occupied and immutable for the GA
struct FixedTask {
    int orderId = -1;
    int machineId = -1;
    int stepSequence = -1;
    int startMinutes = 0;
    int endMinutes = 0;   // must be > startMinutes and startMinutes >= nowMinutes
    int kind = 0;         // 0 = in-progress on healthy machine, 1 = resume after repair (no re-setup)
};
struct OrderProgress {
    int orderId = -1;
    int doneSteps = 0;    // count of leading steps fully completed before now
};
struct MachineLastOrder {
    int machineId = -1;
    int orderId = -1;     // order that last occupied the machine (setup family continuity), -1 = untouched
};
struct RescheduleContext {
    int nowMinutes = 0;   // snapshot time T on the ORIGINAL engine timeline (minute 0 = planStart)
    std::vector<FixedTask> fixedTasks;
    std::vector<OrderProgress> progress;
    std::vector<MachineLastOrder> lastOrderInit;
};