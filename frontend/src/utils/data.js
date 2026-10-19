export const TEMPLATE_ROWS = [
    // WO-1001: BRK-01 - Giá đỡ động cơ
    { OrderCode: 'WO-1001', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 80, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 22:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.8 },
    { OrderCode: 'WO-1001', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 80, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 22:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 1.5 },
    { OrderCode: 'WO-1001', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 80, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 22:00', StepSequence: 3, MachineCode: 'M_WELD', CycleTimeMinutes: 1.2 },
    { OrderCode: 'WO-1001', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 80, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 22:00', StepSequence: 4, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.5 },

    // WO-1002: SHF-02 - Trục truyền động
    { OrderCode: 'WO-1002', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 60, Priority: 1, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-21 22:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.4 },
    { OrderCode: 'WO-1002', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 60, Priority: 1, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-21 22:00', StepSequence: 2, MachineCode: 'M_TURN', CycleTimeMinutes: 2.0 },
    { OrderCode: 'WO-1002', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 60, Priority: 1, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-21 22:00', StepSequence: 3, MachineCode: 'M_MILL', CycleTimeMinutes: 0.8 },
    { OrderCode: 'WO-1002', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 60, Priority: 1, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-21 22:00', StepSequence: 4, MachineCode: 'M_GRIND', CycleTimeMinutes: 1.5 },

    // WO-1003: FRM-03 - Khung máy hàn
    { OrderCode: 'WO-1003', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 14:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1003', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 14:00', StepSequence: 2, MachineCode: 'M_WELD', CycleTimeMinutes: 3.0 },
    { OrderCode: 'WO-1003', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 14:00', StepSequence: 3, MachineCode: 'M_GRIND', CycleTimeMinutes: 0.7 },
    { OrderCode: 'WO-1003', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 14:00', StepSequence: 4, MachineCode: 'M_PAINT', CycleTimeMinutes: 1.0 },

    // WO-1004: FLG-04 - Mặt bích
    { OrderCode: 'WO-1004', ProductCode: 'FLG-04', ProductName: 'Mặt bích', FamilyCode: 'TURNED', Quantity: 100, Priority: 1, ReleaseDate: '2026-10-19 14:00', DueDate: '2026-10-22 14:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.5 },
    { OrderCode: 'WO-1004', ProductCode: 'FLG-04', ProductName: 'Mặt bích', FamilyCode: 'TURNED', Quantity: 100, Priority: 1, ReleaseDate: '2026-10-19 14:00', DueDate: '2026-10-22 14:00', StepSequence: 2, MachineCode: 'M_TURN', CycleTimeMinutes: 1.2 },
    { OrderCode: 'WO-1004', ProductCode: 'FLG-04', ProductName: 'Mặt bích', FamilyCode: 'TURNED', Quantity: 100, Priority: 1, ReleaseDate: '2026-10-19 14:00', DueDate: '2026-10-22 14:00', StepSequence: 3, MachineCode: 'M_MILL', CycleTimeMinutes: 0.9 },

    // WO-1005: PLT-05 - Tấm đế
    { OrderCode: 'WO-1005', ProductCode: 'PLT-05', ProductName: 'Tấm đế', FamilyCode: 'SHEET', Quantity: 120, Priority: 1, ReleaseDate: '2026-10-19 14:00', DueDate: '2026-10-21 14:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.6 },
    { OrderCode: 'WO-1005', ProductCode: 'PLT-05', ProductName: 'Tấm đế', FamilyCode: 'SHEET', Quantity: 120, Priority: 1, ReleaseDate: '2026-10-19 14:00', DueDate: '2026-10-21 14:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1005', ProductCode: 'PLT-05', ProductName: 'Tấm đế', FamilyCode: 'SHEET', Quantity: 120, Priority: 1, ReleaseDate: '2026-10-19 14:00', DueDate: '2026-10-21 14:00', StepSequence: 3, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.4 },

    // WO-1006: HSG-06 - Vỏ hộp số
    { OrderCode: 'WO-1006', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 50, Priority: 2, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-22 22:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.9 },
    { OrderCode: 'WO-1006', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 50, Priority: 2, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-22 22:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 2.2 },
    { OrderCode: 'WO-1006', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 50, Priority: 2, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-22 22:00', StepSequence: 3, MachineCode: 'M_TURN', CycleTimeMinutes: 1.1 },
    { OrderCode: 'WO-1006', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 50, Priority: 2, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-22 22:00', StepSequence: 4, MachineCode: 'M_GRIND', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1006', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 50, Priority: 2, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-22 22:00', StepSequence: 5, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.6 },

    // WO-1007: BRK-01 - Giá đỡ động cơ
    { OrderCode: 'WO-1007', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 60, Priority: 1, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-22 14:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.8 },
    { OrderCode: 'WO-1007', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 60, Priority: 1, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-22 14:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 1.5 },
    { OrderCode: 'WO-1007', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 60, Priority: 1, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-22 14:00', StepSequence: 3, MachineCode: 'M_WELD', CycleTimeMinutes: 1.2 },
    { OrderCode: 'WO-1007', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 60, Priority: 1, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-22 14:00', StepSequence: 4, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.5 },

    // WO-1008: SHF-02 - Trục truyền động
    { OrderCode: 'WO-1008', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 40, Priority: 2, ReleaseDate: '2026-10-20 14:00', DueDate: '2026-10-22 22:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.4 },
    { OrderCode: 'WO-1008', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 40, Priority: 2, ReleaseDate: '2026-10-20 14:00', DueDate: '2026-10-22 22:00', StepSequence: 2, MachineCode: 'M_TURN', CycleTimeMinutes: 2.0 },
    { OrderCode: 'WO-1008', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 40, Priority: 2, ReleaseDate: '2026-10-20 14:00', DueDate: '2026-10-22 22:00', StepSequence: 3, MachineCode: 'M_MILL', CycleTimeMinutes: 0.8 },
    { OrderCode: 'WO-1008', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 40, Priority: 2, ReleaseDate: '2026-10-20 14:00', DueDate: '2026-10-22 22:00', StepSequence: 4, MachineCode: 'M_GRIND', CycleTimeMinutes: 1.5 },

    // WO-1009: FRM-03 - Khung máy hàn
    { OrderCode: 'WO-1009', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 30, Priority: 1, ReleaseDate: '2026-10-20 14:00', DueDate: '2026-10-23 14:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1009', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 30, Priority: 1, ReleaseDate: '2026-10-20 14:00', DueDate: '2026-10-23 14:00', StepSequence: 2, MachineCode: 'M_WELD', CycleTimeMinutes: 3.0 },
    { OrderCode: 'WO-1009', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 30, Priority: 1, ReleaseDate: '2026-10-20 14:00', DueDate: '2026-10-23 14:00', StepSequence: 3, MachineCode: 'M_GRIND', CycleTimeMinutes: 0.7 },
    { OrderCode: 'WO-1009', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 30, Priority: 1, ReleaseDate: '2026-10-20 14:00', DueDate: '2026-10-23 14:00', StepSequence: 4, MachineCode: 'M_PAINT', CycleTimeMinutes: 1.0 },

    // WO-1010: HSG-06 - Vỏ hộp số
    { OrderCode: 'WO-1010', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-21 06:00', DueDate: '2026-10-21 14:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.9 },
    { OrderCode: 'WO-1010', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-21 06:00', DueDate: '2026-10-21 14:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 2.2 },
    { OrderCode: 'WO-1010', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-21 06:00', DueDate: '2026-10-21 14:00', StepSequence: 3, MachineCode: 'M_TURN', CycleTimeMinutes: 1.1 },
    { OrderCode: 'WO-1010', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-21 06:00', DueDate: '2026-10-21 14:00', StepSequence: 4, MachineCode: 'M_GRIND', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1010', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-21 06:00', DueDate: '2026-10-21 14:00', StepSequence: 5, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.6 },

    // WO-1011: FLG-04 - Mặt bích
    { OrderCode: 'WO-1011', ProductCode: 'FLG-04', ProductName: 'Mặt bích', FamilyCode: 'TURNED', Quantity: 80, Priority: 1, ReleaseDate: '2026-10-21 06:00', DueDate: '2026-10-23 22:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.5 },
    { OrderCode: 'WO-1011', ProductCode: 'FLG-04', ProductName: 'Mặt bích', FamilyCode: 'TURNED', Quantity: 80, Priority: 1, ReleaseDate: '2026-10-21 06:00', DueDate: '2026-10-23 22:00', StepSequence: 2, MachineCode: 'M_TURN', CycleTimeMinutes: 1.2 },
    { OrderCode: 'WO-1011', ProductCode: 'FLG-04', ProductName: 'Mặt bích', FamilyCode: 'TURNED', Quantity: 80, Priority: 1, ReleaseDate: '2026-10-21 06:00', DueDate: '2026-10-23 22:00', StepSequence: 3, MachineCode: 'M_MILL', CycleTimeMinutes: 0.9 },

    // WO-1012: PLT-05 - Tấm đế
    { OrderCode: 'WO-1012', ProductCode: 'PLT-05', ProductName: 'Tấm đế', FamilyCode: 'SHEET', Quantity: 90, Priority: 2, ReleaseDate: '2026-10-21 14:00', DueDate: '2026-10-23 14:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.6 },
    { OrderCode: 'WO-1012', ProductCode: 'PLT-05', ProductName: 'Tấm đế', FamilyCode: 'SHEET', Quantity: 90, Priority: 2, ReleaseDate: '2026-10-21 14:00', DueDate: '2026-10-23 14:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1012', ProductCode: 'PLT-05', ProductName: 'Tấm đế', FamilyCode: 'SHEET', Quantity: 90, Priority: 2, ReleaseDate: '2026-10-21 14:00', DueDate: '2026-10-23 14:00', StepSequence: 3, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.4 }
];