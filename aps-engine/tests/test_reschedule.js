// R2 gate: context parses through N-API and Status reaches JS
const engine = require('./build/Release/aps_engine.node');
const ops = [
    { OrderId: 1, MachineId: 1, Step: 1, Time: 20 },
    { OrderId: 1, MachineId: 2, Step: 2, Time: 7 },
    { OrderId: 2, MachineId: 2, Step: 1, Time: 5 },
    { OrderId: 2, MachineId: 1, Step: 2, Time: 6 },
    { OrderId: 3, MachineId: 2, Step: 1, Time: 3 }
];
const ctx = {
    NowMinutes: 10,
    Progress: [{ OrderId: 2, DoneSteps: 1 }],
    LastOrder: [{ MachineId: 2, OrderId: 2 }],
    FixedTasks: [{ OrderId: 1, MachineId: 1, Step: 1, Start: 10, End: 20, Kind: 0 }]
};
const fail = (msg) => { console.error('FAIL: ' + msg); process.exit(1); };

engine.runSchedule(ops, { Seed: 7, PopulationSize: 4, MaxGenerations: 5, Reschedule: ctx })
    .then(out => {
        const fixed = out.Tasks.filter(t => t.Status === 1);
        const fresh = out.Tasks.filter(t => t.Status === 0);
        if (out.Tasks.length !== 4) fail('expected 4 tasks, got ' + out.Tasks.length);
        if (fixed.length !== 1 || fresh.length !== 3) fail('fixed/fresh split wrong');
        if (fixed[0].StartTime !== 10 || fixed[0].EndTime !== 20) fail('fixed chunk times wrong');
        if (out.Stats.Makespan !== 27) fail('makespan ' + out.Stats.Makespan + ' != 27');
        console.log('PASS: positive case (4 tasks, 1 fixed, makespan 27)');
        // negative: contradiction done=1 AND fixed step=1 must reject
        return engine.runSchedule(ops, {
            Seed: 7,
            Reschedule: {
                NowMinutes: 10,
                Progress: [{ OrderId: 1, DoneSteps: 1 }],
                FixedTasks: [{ OrderId: 1, MachineId: 1, Step: 1, Start: 10, End: 20 }]
            }
        }).then(() => fail('contradictory context was accepted'), () => {
            console.log('PASS: contradictory context rejected through N-API');
            console.log('ADDON R2: ALL TESTS PASSED');
        });
    })
    .catch(e => fail(e.message));