<!--
  DRAFT (initial). Finalize after deployment:
  - fill the [TODO] links and environment variables
  - refresh screenshots from the hosted version
  - confirm the numbers marked [VERIFY]
-->

# mes-aps: Advanced Planning & Scheduling for a Job Shop

![APS Dashboard](./docs/images/main-gantt-chart.png)

**Live demo:** [Vercel URL] · **API:** [Render URL] · **Docs:** [System Metrics & Business Logic](./docs/BUSINESS_LOGIC.md)

## Overview

mes-aps plans a factory floor the way a production planner needs it: import orders, run the optimizer, read a Gantt chart and a KPI panel, then re-plan when a machine breaks.

It extends the classic Job Shop Scheduling Problem (JSSP) with real MES constraints: release and due dates, order priorities, product-family setup (changeover) times, machine efficiency, planned maintenance, breakdowns and rescheduling from a chosen time **T**. The optimizer is a **C++ Genetic Algorithm** with a greedy construction step, exposed to a **Node.js** backend through **N-API**, with a **React** front end.

## Key Features

* **Interactive Gantt chart:** one row per machine. Hover a step to highlight every step of the same order. Gray blocks are history, dashed outlines are fixed (running) steps, red outlines are late orders, and the red dashed line marks time T.
* **KPI panel:** makespan, end time, late orders, OTD, total tardiness, setup ratio, bottleneck, utilization per machine and the cause of each delay.
* **Master data:** import orders from CSV/Excel (validated), edit quantity, priority, release and due date, export to Excel.
* **Machines:** set efficiency per machine and add planned maintenance or breakdown windows.
* **Reschedule at time T:** steps finished before T are frozen, the step running at T resumes with its remaining time after a repair, and everything else is re-optimized.
* **Compare runs:** per-order finish time, tardiness and status (improved, worsened, shifted) between any two runs.
* **GA vs FIFO / EDD:** every run is benchmarked against two classic dispatching rules.
* **Audit log:** every action (import, update, run, reschedule) is recorded and filterable.

## How It Works?

```
React (Vercel)  ──REST──▶  Node.js API (Render)  ──N-API worker──▶  C++ GA engine
                                   │
                                   ▼
                       PostgreSQL (Supabase)
```

* The C++ engine runs in a worker so a long optimization never blocks the Node.js event loop.
* Routing and setup data use cache-friendly flat arrays (`opMatrix`, `setupLookup`), which keeps a run under 200 ms on the demo scenarios.
* The GA minimizes one score:

  ```
  Fitness = Makespan + Σ (Tardiness × PriorityWeight) + TotalSetupTime
  PriorityWeight: Normal = 10, High = 50, Urgent = 200
  ```

  Late urgent orders cost far more than a slightly longer plan, so the optimizer protects them first.
* Machines run continuously (three shifts), so the model has no shift calendar.

See [BUSINESS_LOGIC.md](./docs/BUSINESS_LOGIC.md) for every formula with worked examples.

## Results

| Scenario | Algorithm | Makespan (min) | Late orders | Total tardiness (min) |
| :--- | :--- | ---: | ---: | ---: |
| Congested, 10 orders, 6 machines | **GA** | 1792 | **0** | **0** |
| | FIFO | 1792 | 3 | 1331 |
| | EDD | 2235 | 2 | 262 |

The GA's advantage appears under congestion (urgent orders arriving into a busy shop). With light load every method reaches the same makespan, because the makespan cannot fall below the release time plus the processing time of the last order.

<p align="center">
  <img src="./docs/images/benchmark.png" alt="Production Schedule Gantt Chart" width="60%">
</p>
<p align="center"><em>Benchmark results.</em></p>


## Screenshots main UI

| Compare Scenarios (What-If) | Reschedule & Breakdown |
| :---: | :---: |
| ![Compare Runs](./docs/images/compare-runs-kpi.png) | ![Reschedule](./docs/images/reschedule.png) |
| *Compare runs to see shifted minutes, late status and KPIs.* | *Handle machine downtime at a specific time T.* |

<p align="center">
  <img src="./docs/images/gantt-chart-schedule.png" alt="Production Schedule Gantt Chart" width="100%">
</p>
<p align="center"><em>Gantt chart after rescheduling.</em></p>

## Testing

Ten black-box scenarios were run against the full stack.

| ID | Scenario | Result |
| :--- | :--- | :---: |
| TC001 | Import validation (priority must be 1–3), template round-trip, master data export | Pass |
| TC002 | Run schedule: loading skeleton, Gantt render, hover highlight, step labels when zoomed | Pass |
| TC003 | Change quantity, routing snapshot refresh, audit log entries | Pass |
| TC004 | Due date earlier than release: order flagged late, KPI and delay cause updated | Pass |
| TC005 | Maintenance window and efficiency change: plan-outdated hint, grey block, cutting time doubles | Pass |
| TC006 | Reschedule at T with a breakdown: T line, resumed step with remaining time | Pass |
| TC007 | Compare two runs and swap them: improved ↔ worsened | Pass |
| TC008 | Audit log action filter | Pass |
| TC009 | CSV export row count equals Gantt block count | Pass |
| TC010 | Downtime validation (end after start), layout controls | Pass |

## ⚠️ Limitations & Roadmap

* **One machine per operation (JSSP, not FJSSP).** If a machine breaks, its steps wait for repair instead of moving to an alternative machine. Flexible job shop scheduling is the next step.
* The model assumes continuous operation, with no shift calendar or operator constraints.
* Planned: a bulk endpoint for saving machine efficiency, order status in the CSV export, a machine-load-over-time view.

## Getting Started

### Prerequisites

Because the project compiles a native C++ addon for Node.js you need:

* **Node.js** (v18+ recommended)
* **PostgreSQL** (v14+)
* **C++ compiler:** GCC/G++ (Linux/Mac) or Visual Studio Build Tools (Windows)
* **Python 3.x** (required by `node-gyp`)

### Installation

**1. Build the core C++ engine (addon)**

```bash
cd aps-engine
npm install
npm run build
```

**2. Backend**: [install, `.env` variables, migrations, start command]

**3. Frontend**: [install, `VITE_API_BASE`, dev and build commands]

## ☁️ Deployment

[Tafter hosting: Supabase (PostgreSQL), Render (backend, native addon build), Vercel (frontend), environment variables, CORS.]

---
<div align="center">
  <p><i>- algernon -</i></p>
</div>