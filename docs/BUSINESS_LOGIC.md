# System Metrics & Business Logic (APS Engine)

This document describes the data structure design principles, mathematical formulas, objective function, and MES business logic implemented in the Core C++ Engine and KPI system.

> **New here?** Skip to [Section 5: Formula Guide in Plain Language](#5-formula-guide-in-plain-language). It explains every number you see on the dashboard, with a worked example.

---

## 1. Data Architecture

Since the Genetic Algorithm (GA) must evaluate millions of iterations to find an optimal solution, frequent database queries or complex data structures can create CPU bottlenecks. The C++ engine is designed with a focus on CPU cache efficiency.

- **`opMatrix` (O(1) Routing Matrix):** Implemented as a two-dimensional vector indexed by `[orderId][stepSequence - 1]`. This allows the engine to retrieve operation information instantly without iterating through operations to find a match.

- **`setupLookup` (Dynamic 1D Setup Matrix):** Instead of using a three-dimensional nested vector to store product changeover times (`Machine × FromFamily × ToFamily`), the system dynamically allocates a single one-dimensional array.

  - **Formula:** `Index = (MachineID * TotalFamilies + FromFamily) * TotalFamilies + ToFamily`
  - **Purpose:** Stores data in contiguous memory to maximize CPU cache hit rates and avoid memory fragmentation, enabling the GA to execute extremely quickly (under 200 ms).

---

## 2. Core Engine (C++ GA Optimization)

### 2.1. Processing Time & Setup

- **Effective Processing Time:**

  `P_eff = ceil(P_nominal / Rate)`

  *(Where `Rate ∈ (0, 1]`. For example, if `P_nominal = 64` minutes and `Rate = 0.5`, then `P_eff = 128` minutes. Note that setup time is not scaled by the efficiency rate.)*

- **Setup Time (Changeover):**

  `Setup = matrix[machine][previous order family][current order family]`

  *(Setup time is zero if the next operation belongs to the same product family or if the machine is idle.)*

### 2.2. Scheduling Constraints

- **Start Time:** The operation's start time is the maximum of the following:
  1. The time the machine becomes available, including setup time.
  2. The completion time of the preceding operation in the same order.
  3. The material availability time (`Release Time`).

- **Downtime Constraints (Maintenance/Breakdowns):** The start time is postponed past any downtime windows as necessary to ensure that the actual machine occupancy interval does not overlap with any preventive maintenance (PM) or breakdown window.

### 2.3. Fitness Function

The system searches for a solution with the **lowest possible fitness score**:

`Fitness = Makespan + PriorityPenalty + (1 * TotalSetupTime)`

- **Makespan (`C_max`):** The latest task completion time across the entire shop floor, measured in minutes from time zero (`planStart`).

- **Tardiness:** Calculated only once, at the final operation of each order.

  `Tardiness = max(0, EndTime - DueDate)`

- **Priority Penalty:**

  `PriorityPenalty = Σ (Tardiness * Weight)`

  Priority weights are defined as follows: P1 = 10, P2 = 50, P3 = 200.

- **FIFO/EDD Baselines:** Operations are scheduled in contiguous order blocks using either Release Time (FIFO) or Due Date (EDD). These baseline schedules are used to evaluate the GA's performance.

---

## 3. KPI Metrics (React Frontend)

The following metrics are used to evaluate scheduling performance in a standard MES context.

- **OTD (On-Time Delivery):** Number of orders delivered on time divided by the total number of orders.

- **Total Tardiness:** The total number of minutes by which all late orders exceed their due dates.

- **Setup Ratio:**

  `Σ Setup / (Σ Setup + Σ Cutting)`

- **Cutting Time:**

  `Σ (End - Start)`

  The actual time spent machining with the cutting tool or spindle.

- **Booked Time:**

  `Σ (End - SetupStart) = Setup + Waiting + Cutting`

  The total time slot reserved for an order on a machine, including setup, waiting, and cutting.

- **Utilization (Running):**

  `(Cutting + Setup) / (Makespan - Unavailable Minutes Within the Horizon)`

- **Booked Utilization:**

  `Booked / (Makespan - Unavailable Minutes)`

  This metric is provided for reference only and does not represent actual value-generating efficiency.

- **Bottleneck:** The machine with the highest Running Utilization.

- **Root Cause (Delay Cause):** The single longest idle waiting interval for an order before an operation, reported together with the operation name and machine name.

---

## 4. Dynamic Rescheduling (At Time T)

When an unexpected event occurs, such as a machine breakdown, the shop floor reschedules operations from time `T`, treating earlier time as historical. Tasks are divided into three categories.

### 4.1. DONE (Historical)

- **Condition:** `End <= T`
- **Handling:** The task is complete and excluded from further optimization. It is not added to the gene pool.

### 4.2. RUNNING (In Progress)

- **Condition:** `Start <= T < End`
- **Handling (Chunk Resume):** The task is locked in place (`Fixed`).

  - **Remaining Processing Time:**

    `Remaining = End - T`

    Calculated in effective processing minutes, making it valid for all efficiency rates.

  - **If the machine is broken:** The remaining processing segment is rescheduled to `[T + R, T + R + Remaining)`, where `R` is the machine repair duration.

  - **If the machine is operational:** The existing schedule is preserved as `[T, End)`.

### 4.3. TODO (Pending)

- **Condition:** `Start > T`
- **Handling:** The task is added to the gene pool, allowing the algorithm to reorder and reschedule it.

### 4.4. Data Consistency Constraints

- **Double-Scaling Prevention Flag:** When an in-progress operation (`RUNNING`) is reintroduced into the gene pool, its `Time` is set to the remaining chunk duration and accompanied by a flag that prevents the efficiency rate from being applied a second time.

- **Operation Sequence Integrity:** Completed operations must form a contiguous prefix of the sequence `1..k`. The fixed operation must be exactly operation `k+1`.

---

## 5. Formula Guide in Plain Language

All times are in **minutes from `planStart`** (the earliest release time of the plan). The shop runs three shifts with machines operating continuously, so there is no shift calendar: a machine is either working, waiting, or in a downtime window.

### 5.1 Symbols

| Symbol | Meaning |
| :--- | :--- |
| `r` | Release time: the earliest moment an order may start (material ready). |
| `d` | Due date: when the customer expects the order. |
| `p` | Processing time of one step on one machine. |
| `C` | Completion time: when an order's last step ends. |
| `Rate` | Machine efficiency in (0, 1]. 1.0 = nominal speed, 0.5 = half speed. |

### 5.2 Every dashboard number, in one table

The example column uses a congested 10-order scenario (Run #1: 6 machines, 3 priority levels, 4 product families).

| Parameter | Formula | In plain words | Example (Run #1) |
| :--- | :--- | :--- | :--- |
| Processing time | `p = ceil(qty × cycle_time)` | Units × minutes per unit, rounded up. | 150 units × 0.8 min = 120 min |
| Effective time | `p_eff = ceil(p / Rate)` | A slower machine takes longer. Setup is not scaled. | 100 min at Rate 0.8 becomes 125 min |
| Setup | `matrix[machine][prev family][next family]` | Changeover cost, zero if the family does not change. | M_CUT: 135 min in total |
| Tardiness (per order) | `max(0, C − d)` | Minutes late. Early orders count as 0. | Finish 16:00, due 14:00 gives 120 min |
| Late orders | `count(C > d)` | How many orders missed their due date. | 0 of 10 |
| OTD | `(N − late) / N` | Share of orders delivered on time. | 10 / 10 = 100% |
| Total tardiness | `Σ tardiness` | Sum of all minutes late. | 0 min |
| Makespan | `max(C) over all orders` | When the last job in the whole plan finishes. | 1792 min (29.9 h) |
| Ends | `planStart + makespan` | The same moment as a clock time. | 19/10 06:00 + 29 h 52 min = 20/10 11:52 |
| Cutting | `Σ (End − Start)` | Time a machine really spends working on parts. | M_MILL: 980 min |
| Setup ratio | `Σ setup / (Σ setup + Σ cutting)` | Share of productive machine time lost to changeovers. | 473 / (473 + 3528) = 11.8% |
| Utilization | `(cutting + setup) / (makespan − unavailable)` | How busy a machine is across the plan. | M_CUT: (570 + 135) / 1792 = 39.3% |
| Avg utilization | `mean of machine utilizations` | The same number averaged over the six machines. | 37.2% |
| Bottleneck | `machine with max utilization` | The machine that limits the plan. | M_MILL (59.3%) |
| Booked | `Σ (End − SetupStart)` | Time a machine is held for orders, including waiting. Reference only. | M_CUT: 1596 min |
| Root cause | `longest wait before one step` | Why an order is late: the biggest single wait, with step and machine. | "Waited 322 min before step 1 on M_CUT" |

### 5.3 What the GA actually minimizes

```
Fitness = Makespan + Σ (Tardiness × Weight) + TotalSetup        (lower is better)
Weight:  Priority 1 = 10   Priority 2 = 50   Priority 3 = 200
```

Read it as a price list:

- Every minute the plan gets longer costs **1 point**.
- Every minute of changeover costs **1 point**.
- Every minute a **Normal** order is late costs **10**, **High** costs **50**, **Urgent** costs **200**.

Because lateness is priced far above makespan, the GA will accept a longer plan or more setup if that saves an urgent order.

Worked example with Run #1: Makespan 1792 + penalty 0 + setup 473 gives a fitness of about **2265**.
If one Urgent order were 30 min late, the penalty alone would add 30 × 200 = **6000**. The same delay on a Normal order adds only 30 × 10 = **300**.

### 5.4 Reschedule at time T, step by step

Example: a step runs 08:00 to 11:00 on a machine, you set **T = 10:00**, and the machine breaks for **R = 120 min**.

1. Steps with `End ≤ T` are **DONE**: frozen as history (grey).
2. The step with `Start ≤ T < End` is **RUNNING**: `Remaining = 11:00 − 10:00 = 60 min`.
3. The machine is broken, so the step resumes after the repair: `[T + R, T + R + Remaining) = [12:00, 13:00)`.
4. Steps with `Start > T` are **TODO**: the GA reorders them freely around the new constraints.

If the machine were not broken, the running step would simply keep `[10:00, 11:00)`.

### 5.5 Comparing two runs

| Column | Formula | Meaning |
| :--- | :--- | :--- |
| Δ finish | `C_new − C_old` | Positive means the order now finishes later. |
| Improved | tardiness went down | The order got better. |
| Worsened | tardiness went up | The order paid the price. |
| Shifted | finish moved, tardiness unchanged | Moved in time but still equally (un)late. |
| Same | nothing changed | Identical in both runs. |

### 5.6 Why the GA sometimes equals FIFO

Two facts help when reading results.

- **Makespan lower bound:** `LB = max over orders ( r + Σ p_eff )`. No algorithm can finish before the order that is released last has also finished its own steps. When FIFO already reaches `LB`, the GA cannot improve makespan.
- **Load matters:** when machines are lightly loaded there are almost no queues, so the order of jobs barely matters and every method looks the same. The GA pays off under congestion: many orders released together, tight due dates, urgent orders arriving late, shared bottleneck machines.

In Run #1 (congested), the GA finishes with 0 late orders while FIFO has 3 late orders (1331 min of tardiness) and EDD has 2 (262 min).