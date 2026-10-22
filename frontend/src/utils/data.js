export const TEMPLATE_ROWS = [
    // ---------------- THỜI ĐIỂM 1: 06:00 SÁNG 19/10 (TRAFFIC JAM) ----------------

    // WO-1001: (SHEET) - Đơn to, thời gian rộng, độ ưu tiên trung bình
    { OrderCode: 'WO-1001', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 150, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 22:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.8 },
    { OrderCode: 'WO-1001', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 150, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 22:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 1.5 },
    { OrderCode: 'WO-1001', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 150, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 22:00', StepSequence: 3, MachineCode: 'M_WELD', CycleTimeMinutes: 1.2 },
    { OrderCode: 'WO-1001', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 150, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 22:00', StepSequence: 4, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.5 },

    // WO-1002: (TURNED) - Đơn thường, độ ưu tiên trung bình
    { OrderCode: 'WO-1002', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 100, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 20:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.4 },
    { OrderCode: 'WO-1002', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 100, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 20:00', StepSequence: 2, MachineCode: 'M_TURN', CycleTimeMinutes: 2.0 },
    { OrderCode: 'WO-1002', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 100, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 20:00', StepSequence: 3, MachineCode: 'M_MILL', CycleTimeMinutes: 0.8 },
    { OrderCode: 'WO-1002', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 100, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 20:00', StepSequence: 4, MachineCode: 'M_GRIND', CycleTimeMinutes: 1.5 },

    // WO-1005: (SHEET) - Đơn nhỏ, cùng Family với 1001.
    { OrderCode: 'WO-1005', ProductCode: 'PLT-05', ProductName: 'Tấm đế', FamilyCode: 'SHEET', Quantity: 60, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 16:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.6 },
    { OrderCode: 'WO-1005', ProductCode: 'PLT-05', ProductName: 'Tấm đế', FamilyCode: 'SHEET', Quantity: 60, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 16:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1005', ProductCode: 'PLT-05', ProductName: 'Tấm đế', FamilyCode: 'SHEET', Quantity: 60, Priority: 2, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-19 16:00', StepSequence: 3, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.4 },

    // WO-1006: (HOUSING) - KẺ PHÁ BĨNH. Ngốn rất nhiều thời gian máy phay (M_MILL).
    // Đã set Priority = 1 (Normal). GA sẽ phạt rất nhẹ nếu thằng này trễ, nên nó sẽ nhường đường cho đơn khác.
    { OrderCode: 'WO-1006', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 120, Priority: 1, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 18:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.9 },
    { OrderCode: 'WO-1006', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 120, Priority: 1, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 18:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 2.2 },
    { OrderCode: 'WO-1006', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 120, Priority: 1, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 18:00', StepSequence: 3, MachineCode: 'M_TURN', CycleTimeMinutes: 1.1 },
    { OrderCode: 'WO-1006', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 120, Priority: 1, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 18:00', StepSequence: 4, MachineCode: 'M_GRIND', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1006', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 120, Priority: 1, ReleaseDate: '2026-10-19 06:00', DueDate: '2026-10-20 18:00', StepSequence: 5, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.6 },


    // ---------------- THỜI ĐIỂM 2: 09:00 SÁNG 19/10 (ĐƠN KHẨN CẤP CHEN NGANG) ----------------
    
    // WO-1003: (WELDED) - Đã set Priority = 3 (High). DueDate cực kỳ gấp.
    // FIFO sẽ bắt nó đợi sau mớ hỗn độn lúc 6h sáng -> Chắc chắn trễ. GA phải ưu tiên xếp lịch ngay.
    { OrderCode: 'WO-1003', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-19 09:00', DueDate: '2026-10-19 14:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1003', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-19 09:00', DueDate: '2026-10-19 14:00', StepSequence: 2, MachineCode: 'M_WELD', CycleTimeMinutes: 3.0 },
    { OrderCode: 'WO-1003', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-19 09:00', DueDate: '2026-10-19 14:00', StepSequence: 3, MachineCode: 'M_GRIND', CycleTimeMinutes: 0.7 },
    { OrderCode: 'WO-1003', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 40, Priority: 3, ReleaseDate: '2026-10-19 09:00', DueDate: '2026-10-19 14:00', StepSequence: 4, MachineCode: 'M_PAINT', CycleTimeMinutes: 1.0 },

    // WO-1004: (TURNED) - Priority = 3 (High). Khẩn cấp.
    { OrderCode: 'WO-1004', ProductCode: 'FLG-04', ProductName: 'Mặt bích', FamilyCode: 'TURNED', Quantity: 80, Priority: 3, ReleaseDate: '2026-10-19 09:00', DueDate: '2026-10-19 15:30', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.5 },
    { OrderCode: 'WO-1004', ProductCode: 'FLG-04', ProductName: 'Mặt bích', FamilyCode: 'TURNED', Quantity: 80, Priority: 3, ReleaseDate: '2026-10-19 09:00', DueDate: '2026-10-19 15:30', StepSequence: 2, MachineCode: 'M_TURN', CycleTimeMinutes: 1.2 },
    { OrderCode: 'WO-1004', ProductCode: 'FLG-04', ProductName: 'Mặt bích', FamilyCode: 'TURNED', Quantity: 80, Priority: 3, ReleaseDate: '2026-10-19 09:00', DueDate: '2026-10-19 15:30', StepSequence: 3, MachineCode: 'M_MILL', CycleTimeMinutes: 0.9 },


    // ---------------- THỜI ĐIỂM 3: CHIỀU 19/10 & SÁNG 20/10 (DỌN DẸP TÀN DƯ) ----------------
    
    // Đám này để Priority = 2 (Trung bình)
    // WO-1007: (SHEET)
    { OrderCode: 'WO-1007', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 90, Priority: 2, ReleaseDate: '2026-10-19 14:00', DueDate: '2026-10-20 12:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.8 },
    { OrderCode: 'WO-1007', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 90, Priority: 2, ReleaseDate: '2026-10-19 14:00', DueDate: '2026-10-20 12:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 1.5 },
    { OrderCode: 'WO-1007', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 90, Priority: 2, ReleaseDate: '2026-10-19 14:00', DueDate: '2026-10-20 12:00', StepSequence: 3, MachineCode: 'M_WELD', CycleTimeMinutes: 1.2 },
    { OrderCode: 'WO-1007', ProductCode: 'BRK-01', ProductName: 'Giá đỡ động cơ', FamilyCode: 'SHEET', Quantity: 90, Priority: 2, ReleaseDate: '2026-10-19 14:00', DueDate: '2026-10-20 12:00', StepSequence: 4, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.5 },

    // WO-1008: (TURNED)
    { OrderCode: 'WO-1008', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 70, Priority: 2, ReleaseDate: '2026-10-19 15:00', DueDate: '2026-10-20 14:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.4 },
    { OrderCode: 'WO-1008', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 70, Priority: 2, ReleaseDate: '2026-10-19 15:00', DueDate: '2026-10-20 14:00', StepSequence: 2, MachineCode: 'M_TURN', CycleTimeMinutes: 2.0 },
    { OrderCode: 'WO-1008', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 70, Priority: 2, ReleaseDate: '2026-10-19 15:00', DueDate: '2026-10-20 14:00', StepSequence: 3, MachineCode: 'M_MILL', CycleTimeMinutes: 0.8 },
    { OrderCode: 'WO-1008', ProductCode: 'SHF-02', ProductName: 'Trục truyền động', FamilyCode: 'TURNED', Quantity: 70, Priority: 2, ReleaseDate: '2026-10-19 15:00', DueDate: '2026-10-20 14:00', StepSequence: 4, MachineCode: 'M_GRIND', CycleTimeMinutes: 1.5 },

    // WO-1009: (WELDED)
    { OrderCode: 'WO-1009', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 50, Priority: 2, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-20 17:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1009', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 50, Priority: 2, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-20 17:00', StepSequence: 2, MachineCode: 'M_WELD', CycleTimeMinutes: 3.0 },
    { OrderCode: 'WO-1009', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 50, Priority: 2, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-20 17:00', StepSequence: 3, MachineCode: 'M_GRIND', CycleTimeMinutes: 0.7 },
    { OrderCode: 'WO-1009', ProductCode: 'FRM-03', ProductName: 'Khung máy hàn', FamilyCode: 'WELDED', Quantity: 50, Priority: 2, ReleaseDate: '2026-10-20 06:00', DueDate: '2026-10-20 17:00', StepSequence: 4, MachineCode: 'M_PAINT', CycleTimeMinutes: 1.0 },

    // WO-1010: (HOUSING)
    { OrderCode: 'WO-1010', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 40, Priority: 2, ReleaseDate: '2026-10-20 08:00', DueDate: '2026-10-21 10:00', StepSequence: 1, MachineCode: 'M_CUT', CycleTimeMinutes: 0.9 },
    { OrderCode: 'WO-1010', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 40, Priority: 2, ReleaseDate: '2026-10-20 08:00', DueDate: '2026-10-21 10:00', StepSequence: 2, MachineCode: 'M_MILL', CycleTimeMinutes: 2.2 },
    { OrderCode: 'WO-1010', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 40, Priority: 2, ReleaseDate: '2026-10-20 08:00', DueDate: '2026-10-21 10:00', StepSequence: 3, MachineCode: 'M_TURN', CycleTimeMinutes: 1.1 },
    { OrderCode: 'WO-1010', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 40, Priority: 2, ReleaseDate: '2026-10-20 08:00', DueDate: '2026-10-21 10:00', StepSequence: 4, MachineCode: 'M_GRIND', CycleTimeMinutes: 1.0 },
    { OrderCode: 'WO-1010', ProductCode: 'HSG-06', ProductName: 'Vỏ hộp số', FamilyCode: 'HOUSING', Quantity: 40, Priority: 2, ReleaseDate: '2026-10-20 08:00', DueDate: '2026-10-21 10:00', StepSequence: 5, MachineCode: 'M_PAINT', CycleTimeMinutes: 0.6 }
];