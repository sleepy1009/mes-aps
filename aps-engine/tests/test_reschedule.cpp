// deterministic unit test for the reschedule context (R1)
#include "../include/Scheduler.h"
#include <cstdio>
#include <cstdlib>
#include <vector>
using namespace std;
static int failures = 0;
#define CHECK(cond, msg) do { if (!(cond)) { printf("FAIL: %s\n", msg); ++failures; } else { printf("PASS: %s\n", msg); } } while (0)
static Operation mkOp(int order, int machine, int step, int p) {
    Operation op;
    op.orderId = order; op.machineId = machine; op.stepSequence = step;
    op.processingTimeMinutes = p; op.priority = 1; op.dueDateMinutes = 100000;
    return op;
}
int main() {
    // order1: m1 p20 -> m2 p7 | order2: m2 p5 -> m1 p6 | order3: m2 p3
    vector<Operation> ops = {
        mkOp(1, 1, 1, 20), mkOp(1, 2, 2, 7),
        mkOp(2, 2, 1, 5),  mkOp(2, 1, 2, 6),
        mkOp(3, 2, 1, 3),
    };
    // snapshot T = 10: order2 step1 done; order1 step1 in progress on m1 (10 of 20 done -> resume chunk [10,20))
    RescheduleContext ctx;
    ctx.nowMinutes = 10;
    ctx.progress.push_back({2, 1});
    ctx.lastOrderInit.push_back({2, 2});
    FixedTask ft; ft.orderId = 1; ft.machineId = 1; ft.stepSequence = 1;
    ft.startMinutes = 10; ft.endMinutes = 20; ft.kind = 0;
    ctx.fixedTasks.push_back(ft);

    SchedulerConfig cfg; cfg.seed = 7; cfg.populationSize = 4; cfg.maxGenerations = 5;
    JobShopScheduler sch(cfg);
    vector<ScheduledTask> tasks = sch.schedule(ops, {}, {}, {}, ctx);

    CHECK(tasks.size() == 4, "3 new/fixed steps + 1 fixed chunk = 4 tasks"); // 1 fixed + order1 s2 + order2 s2 + order3 s1
    const ScheduledTask* fixed = nullptr;
    const ScheduledTask* o1s2 = nullptr;
    const ScheduledTask* o2s2 = nullptr;
    const ScheduledTask* o3s1 = nullptr;
    for (const auto& t : tasks) {
        if (t.status == 1) fixed = &t;
        else if (t.orderId == 1) o1s2 = &t;
        else if (t.orderId == 2) o2s2 = &t;
        else o3s1 = &t;
    }
    CHECK(fixed && fixed->startTime == 10 && fixed->endTime == 20 && fixed->machineId == 1, "fixed chunk [10,20) on m1");
    CHECK(o3s1 && o3s1->startTime == 10, "order3 step1 clamped to now=10 (machine m2 free but nothing starts before T)");
    CHECK(o1s2 && o1s2->startTime == 20, "order1 step2 waits for its own fixed chunk (oReady=20)");
    CHECK(o2s2 && o2s2->startTime == 20, "order2 step2 waits for m1 (fixed chunk ends 20)");
    CHECK(sch.lastStats().makespan == 27, "makespan = 27 (order1 step2: 20+7)");

    // negative: fixed step must be the first not-completed step
    RescheduleContext bad = ctx;
    bad.progress.clear();
    bad.progress.push_back({1, 1}); // says step1 done AND step1 fixed -> contradiction
    JobShopScheduler sch2(cfg);
    bool threw = false;
    try { sch2.schedule(ops, {}, {}, {}, bad); } catch (const invalid_argument&) { threw = true; }
    CHECK(threw, "contradictory context (done=1 and fixed step=1) is rejected");

    // negative: fixed chunk inside a downtime window is rejected
    RescheduleContext bad2 = ctx;
    MachineWindow w; w.machineId = 1; w.startMinutes = 15; w.endMinutes = 30; w.type = 1;
    JobShopScheduler sch3(cfg);
    threw = false;
    try { sch3.schedule(ops, {}, {w}, {}, bad2); } catch (const invalid_argument&) { threw = true; }
    CHECK(threw, "fixed chunk intersecting a downtime window is rejected");

    // classic mode unchanged: empty context on empty-ish usage must not clamp anything
    JobShopScheduler sch4(cfg);
    vector<ScheduledTask> plain = sch4.schedule(ops, {}, {}, {}, RescheduleContext());
    CHECK(sch4.lastStats().makespan <= 27 + 20 && plain.size() == 5, "classic mode still schedules all 5 steps");

        // rate < 1: TimeIsMachineMinutes must bypass the efficiency scaling (no double scale)
    {
        MachineProfile pr; pr.machineId = 1; pr.efficiencyRate = 0.5;
        vector<Operation> withFlag = { mkOp(1, 1, 1, 10) };
        withFlag[0].timeIsMachineMinutes = true;
        JobShopScheduler schFlag(cfg);
        vector<ScheduledTask> tFlag = schFlag.schedule(withFlag, {}, {}, {pr}, RescheduleContext());
        CHECK(tFlag.size() == 1 && tFlag[0].endTime - tFlag[0].startTime == 10,
              "TimeIsMachineMinutes bypasses rate scaling");
        vector<Operation> noFlag = { mkOp(1, 1, 1, 10) };
        JobShopScheduler schNo(cfg);
        vector<ScheduledTask> tNo = schNo.schedule(noFlag, {}, {}, {pr}, RescheduleContext());
        CHECK(tNo.size() == 1 && tNo[0].endTime - tNo[0].startTime == 20,
              "without the flag the rate still scales nominal time");
    }

    printf(failures == 0 ? "ALL TESTS PASSED\n" : "%d TEST(S) FAILED\n", failures);
    return failures == 0 ? 0 : 1;
}