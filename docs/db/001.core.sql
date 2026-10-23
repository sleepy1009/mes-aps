-- 1. RESET DB:
DROP TABLE IF EXISTS AuditLogs CASCADE;
DROP TABLE IF EXISTS MachineDowntimes CASCADE;
DROP TABLE IF EXISTS Schedules CASCADE;
DROP TABLE IF EXISTS ScheduleRuns CASCADE;
DROP TABLE IF EXISTS OrderOperations CASCADE;
DROP TABLE IF EXISTS Orders CASCADE;
DROP TABLE IF EXISTS RoutingSteps CASCADE;
DROP TABLE IF EXISTS SetupMatrix CASCADE;
DROP TABLE IF EXISTS Products CASCADE;
DROP TABLE IF EXISTS ProductFamilies CASCADE;
DROP TABLE IF EXISTS Machines CASCADE;

DROP SEQUENCE IF EXISTS order_code_seq CASCADE;

-- 2. CREATE SEQUENCE
-- UI-created orders get WO-2001, WO-2002... (seed inserts explicit codes below 2001, no clash)
CREATE SEQUENCE order_code_seq START 2001;

-- 3. CREATE TABLES (TỪ GỐC LÊN NGỌN)
CREATE TABLE Machines (
    Id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    MachineCode    VARCHAR(20)  NOT NULL UNIQUE,
    MachineName    VARCHAR(100) NOT NULL,
    IsActive       BOOLEAN      NOT NULL DEFAULT TRUE,
    -- effective processing = ceil(nominal / rate); setup is NOT scaled
    EfficiencyRate NUMERIC(4,2) NOT NULL DEFAULT 1.00 CHECK (EfficiencyRate > 0 AND EfficiencyRate <= 1.00)
);

-- products of the same family need little changeover between them
CREATE TABLE ProductFamilies (
    Id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    FamilyCode VARCHAR(20)  NOT NULL UNIQUE,
    FamilyName VARCHAR(100) NOT NULL
);

CREATE TABLE Products (
    Id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ProductCode VARCHAR(30)  NOT NULL UNIQUE,
    ProductName VARCHAR(100) NOT NULL,
    FamilyId    INT          NOT NULL REFERENCES ProductFamilies(Id)
);

-- changeover minutes when a machine switches from one product family to another.
-- MachineId NULL = default for every machine; a row with a MachineId overrides the default.
-- Not symmetric: (A -> B) and (B -> A) are separate rows. No row = 0 minutes.
CREATE TABLE SetupMatrix (
    Id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    MachineId    INT REFERENCES Machines(Id) ON DELETE CASCADE,
    FromFamilyId INT NOT NULL REFERENCES ProductFamilies(Id) ON DELETE CASCADE,
    ToFamilyId   INT NOT NULL REFERENCES ProductFamilies(Id) ON DELETE CASCADE,
    SetupMinutes INT NOT NULL CHECK (SetupMinutes >= 0)
);

-- (FIXED LỖI SYNTAX Ở ĐÂY): PostgreSQL yêu cầu bọc biểu thức COALESCE trong 2 lớp ngoặc đơn khi tạo Index
CREATE UNIQUE INDEX ux_setup_matrix ON SetupMatrix ((COALESCE(MachineId, 0)), FromFamilyId, ToFamilyId);

-- routing template: the ordered steps of a product, with cycle time per unit
CREATE TABLE RoutingSteps (
    Id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ProductId        INT          NOT NULL REFERENCES Products(Id) ON DELETE CASCADE,
    StepSequence     INT          NOT NULL CHECK (StepSequence > 0),
    MachineId        INT          NOT NULL REFERENCES Machines(Id),
    CycleTimeMinutes NUMERIC(8,2) NOT NULL CHECK (CycleTimeMinutes > 0),
    UNIQUE (ProductId, StepSequence)
);

-- work order: what to make, how many, when material is ready, when it is due
CREATE TABLE Orders (
    Id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    OrderCode   VARCHAR(20) NOT NULL UNIQUE DEFAULT ('WO-' || nextval('order_code_seq')),
    ProductId   INT         NOT NULL REFERENCES Products(Id),
    Quantity    INT         NOT NULL CHECK (Quantity > 0),
    Priority    INT         NOT NULL DEFAULT 1 CHECK (Priority IN (1, 2, 3)), -- 1 normal, 2 high, 3 urgent
    ReleaseDate TIMESTAMPTZ NOT NULL, -- material ready: no operation of this order starts earlier
    DueDate     TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_orders_due_after_release CHECK (DueDate > ReleaseDate)
);

-- snapshot of the routing for one order: ProcessingTimeMinutes = CEIL(Quantity * CycleTimeMinutes)
-- NOMINAL minutes; the effective (rate-scaled) minutes live only in Schedules
CREATE TABLE OrderOperations (
    Id                    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    OrderId               INT NOT NULL REFERENCES Orders(Id) ON DELETE CASCADE,
    MachineId             INT NOT NULL REFERENCES Machines(Id),
    StepSequence          INT NOT NULL CHECK (StepSequence > 0),
    ProcessingTimeMinutes INT NOT NULL CHECK (ProcessingTimeMinutes > 0),
    UNIQUE (OrderId, StepSequence)
);

-- one scheduling run; PlanStart is minute 0 of the engine timeline
CREATE TABLE ScheduleRuns (
    Id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    PlanStart   TIMESTAMPTZ NOT NULL,
    CreatedAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    RunType     VARCHAR(20) NOT NULL DEFAULT 'PLAN', -- PLAN | RESCHEDULE
    ParentRunId INT REFERENCES ScheduleRuns(Id) ON DELETE SET NULL,
    Result      JSONB       NOT NULL DEFAULT '{}'::jsonb -- report shown by the UI: tasks, orders, KPIs, baselines
);

CREATE TABLE Schedules (
    Id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    RunId            INT NOT NULL REFERENCES ScheduleRuns(Id) ON DELETE CASCADE,
    OrderOperationId INT NOT NULL REFERENCES OrderOperations(Id) ON DELETE CASCADE,
    MachineId        INT NOT NULL REFERENCES Machines(Id),
    TaskStatus       INT NOT NULL DEFAULT 0, -- 0 planned, 1 committed (in-progress/resume), 2 history
    SetupStartTime   TIMESTAMPTZ NOT NULL,   -- the machine starts the changeover here
    SetupMinutes     INT NOT NULL DEFAULT 0 CHECK (SetupMinutes >= 0),
    StartTime        TIMESTAMPTZ NOT NULL,
    EndTime          TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_schedules_time_order CHECK (EndTime >= StartTime)
);
CREATE INDEX ix_schedules_run_machine ON Schedules (RunId, MachineId, StartTime);

-- machine unavailable windows: planned maintenance or breakdown events
CREATE TABLE MachineDowntimes (
    Id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    MachineId   INT NOT NULL REFERENCES Machines(Id) ON DELETE CASCADE,
    StartTime   TIMESTAMPTZ NOT NULL,
    EndTime     TIMESTAMPTZ NOT NULL,
    Type        VARCHAR(20) NOT NULL CHECK (Type IN ('PM', 'BREAKDOWN')),
    Description VARCHAR(255),
    CONSTRAINT chk_downtimes_time_order CHECK (EndTime > StartTime)
);
CREATE INDEX ix_downtimes_machine_time ON MachineDowntimes (MachineId, StartTime, EndTime);

-- who changed what; UserId hardcoded 'User_A' until real auth exists
CREATE TABLE AuditLogs (
    Id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    UserId     VARCHAR(50) NOT NULL DEFAULT 'User_A',
    Action     VARCHAR(50) NOT NULL,
    EntityType VARCHAR(50),
    EntityId   INT,
    Payload    JSONB,
    CreatedAt  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_logs_created ON AuditLogs (CreatedAt DESC);