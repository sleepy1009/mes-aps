export const formatDataForTimeline = (schedules) => {
    const columns = [
        { type: 'string', id: 'Machine' },
        { type: 'string', id: 'Job' },
        { type: 'date', id: 'Start' },
        { type: 'date', id: 'End' },
    ];

    const minutesToDate = (minutes) => {
        const d = new Date(1970, 0, 1, 0, 0, 0);
        d.setMinutes(d.getMinutes() + minutes);
        return d;
    };

    const rows = schedules.map((task) => [
        `Machine ${task.machineId}`,
        `Job ${task.orderId} (S${task.step})`,
        minutesToDate(task.startTime), 
        minutesToDate(task.endTime),
    ]);

    return [columns, ...rows];
};