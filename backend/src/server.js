const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const apsEngine = require('../../aps-engine/build/Release/aps_engine.node');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/schedule/run', async (req, res) => {
    try {
        console.log("1. getting data...");
        const { rows: operations } = await pool.query(`
            SELECT 
                op.Id AS operation_id,
                o.Id AS order_id,
                o.Priority AS priority,
                o.DueDate AS due_date,
                m.Id AS machine_id,
                op.StepSequence AS step,
                op.ProcessingTimeMinutes AS time,
                op.SetupTimeMinutes AS setup_time
            FROM OrderOperations op
            INNER JOIN Orders o ON o.Id = op.OrderId
            INNER JOIN Machines m ON m.Id = op.MachineId
            ORDER BY o.Id, op.StepSequence;
        `);

        if (operations.length === 0) {
            return res.status(400).json({ message: "No data available for scheduling!" });
        }

        console.log("2. ID Mapping...");
        let orderSeq = 1;
        let machineSeq = 1;

        const orderToSeq = new Map(); // Real DB Order ID -> C++ ID
        const seqToOrder = new Map(); // C++ ID -> Real DB Order ID
        
        const machineToSeq = new Map(); // Real DB Machine ID -> C++ ID
        const seqToMachine = new Map(); // C++ ID -> Real DB Machine ID

        const operationMap = new Map(); // Key: "RealOrderId_Step", Value: RealOperationId

        const cppInputData = [];
        const baseTime = new Date();
        baseTime.setHours(8, 0, 0, 0);

        for (const row of operations) {
            if (!orderToSeq.has(row.order_id)) {
                orderToSeq.set(row.order_id, orderSeq);
                seqToOrder.set(orderSeq, row.order_id);
                orderSeq++;
            }

            if (!machineToSeq.has(row.machine_id)) {
                machineToSeq.set(row.machine_id, machineSeq);
                seqToMachine.set(machineSeq, row.machine_id);
                machineSeq++;
            }

            operationMap.set(`${row.order_id}_${row.step}`, row.operation_id);

            let dueMinutes = Math.round((new Date(row.due_date) - baseTime) / 60000);
            if (dueMinutes < 0) dueMinutes = 0;

            cppInputData.push({
                OrderId: orderToSeq.get(row.order_id),
                Priority: row.priority,
                MachineId: machineToSeq.get(row.machine_id),
                Step: row.step,
                Time: row.time,
                SetupTime: row.setup_time || 0,
                DueDateMinutes: dueMinutes
            });
        }

        console.log("3. Calling C++ Engine (Async)...");
        console.time("C++ Engine Execution");
        const cxxResults = await apsEngine.runSchedule(cppInputData);
        console.timeEnd("C++ Engine Execution");

        console.log("4. Reversing IDs and saving to Schedules table...");
        

        // Transaction DB 
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const realOrderIds = Array.from(orderToSeq.keys());

            await client.query(
                'DELETE FROM Schedules WHERE OrderId = ANY($1::int[])', 
                [realOrderIds]
            );

            const finalSchedules = [];

            for (const task of cxxResults) {
                const realOrderId = seqToOrder.get(task.OrderId);
                const realMachineId = seqToMachine.get(task.MachineId);
                const realOperationId = operationMap.get(`${realOrderId}_${task.Step}`);

                const startTime = new Date(baseTime.getTime() + task.StartTime * 60000);
                const endTime = new Date(baseTime.getTime() + task.EndTime * 60000);

                await client.query(`
                    INSERT INTO Schedules (OrderId, OrderOperationId, MachineId, StartTime, EndTime)
                    VALUES ($1, $2, $3, $4, $5)
                `, [realOrderId, realOperationId, realMachineId, startTime, endTime]);

                finalSchedules.push({
                    orderId: realOrderId,
                    operationId: realOperationId,
                    machineId: realMachineId,
                    step: task.Step,
                    startTime: task.StartTime,
                    endTime: task.EndTime
                });
            }

            await client.query('COMMIT');
            console.log("Scheduling completed and saved to DB.");
            
            res.json({
                message: "Scheduling completed!",
                data: finalSchedules
            });

        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/dataset/import', async (req, res) => {
    const { numJobs, numMachines, operations } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log("1. del all db...");
        await client.query('TRUNCATE TABLE Machines, Orders, OrderOperations, Schedules RESTART IDENTITY CASCADE;');

        console.log("2. creating machines...");
        for (let i = 1; i <= numMachines; i++) {
            await client.query(
                `INSERT INTO Machines (MachineCode, MachineName) VALUES ($1, $2)`, 
                [`M${i}`, `LA ${i}`]
            );
        }

        console.log("3.  DueDate (TWK) and Priority each Job...");
        const jobTotalTime = {};
        for (const op of operations) {
            jobTotalTime[op.jobId] = (jobTotalTime[op.jobId] || 0) + op.time;
        }

        const baseTime = new Date();
        baseTime.setHours(8, 0, 0, 0); // 8:00 AM
        const k_factor = 1.5;

        for (let i = 1; i <= numJobs; i++) {
            // DueDate = T0 + P_i * k
            const pi = jobTotalTime[i] || 0;
            const dueMinutes = Math.round(pi * k_factor);
            const dueDate = new Date(baseTime.getTime() + dueMinutes * 60000);

            const rand = Math.random();
            const priority = rand < 0.2 ? 3 : (rand < 0.5 ? 2 : 1);

            await client.query(
                `INSERT INTO Orders (OrderCode, Quantity, Priority, DueDate) VALUES ($1, $2, $3, $4)`, 
                [`JOB-${i}`, 1, priority, dueDate]
            );
        }

        console.log("4. creating Operations with random Setup Time...");
        for (const op of operations) {
            // Setup Time U[1, 9]
            const setupTime = Math.floor(Math.random() * 9) + 1; 

            await client.query(
                `INSERT INTO OrderOperations (OrderId, MachineId, StepSequence, ProcessingTimeMinutes, SetupTimeMinutes) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [op.jobId, op.machineId, op.step, op.time, setupTime]
            );
        }

        await client.query('COMMIT');
        res.json({ message: "import data successfully!" });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error importing data to DB:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

app.get('/api/dataset/info', async (req, res) => {
    try {
        const mRes = await pool.query('SELECT COUNT(*) FROM Machines');
        const numMachines = parseInt(mRes.rows[0].count);

        const jRes = await pool.query(`
            SELECT 
                o.Id AS id, 
                o.OrderCode AS code, 
                o.Priority AS priority, 
                o.DueDate AS due_date,
                SUM(op.ProcessingTimeMinutes) AS pi_time,
                json_agg(
                    json_build_object(
                        'step', op.StepSequence,
                        'machine', op.MachineId,
                        'time', op.ProcessingTimeMinutes,
                        'setup', op.SetupTimeMinutes
                    ) ORDER BY op.StepSequence
                ) as operations
            FROM Orders o
            LEFT JOIN OrderOperations op ON o.Id = op.OrderId
            GROUP BY o.Id, o.OrderCode, o.Priority, o.DueDate
            ORDER BY o.Id;
        `);
        
        res.json({
            numMachines,
            numJobs: jRes.rows.length,
            jobs: jRes.rows
        });
    } catch (error) {
        console.error("Error in API /api/dataset/info:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`API Server running at http://localhost:${PORT}`);
    console.log(`Test API at http://localhost:${PORT}/api/schedule/run`);
});