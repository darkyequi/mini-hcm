/**
 * Attendance Metrics Calculator
 *
 * Computes all attendance metrics based on punch times and schedule.
 * Handles regular, overnight, and cross-midnight shifts correctly.
 */

/**
 * Creates a local Date object from a date string and time string.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {string} timeStr - "HH:MM"
 * @returns {Date}
 */
function buildLocalDate(dateStr, timeStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hours, minutes] = timeStr.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/**
 * Computes the overlap in milliseconds between two time intervals.
 * @param {number} startA - Start of interval A (ms timestamp)
 * @param {number} endA   - End of interval A (ms timestamp)
 * @param {number} startB - Start of interval B (ms timestamp)
 * @param {number} endB   - End of interval B (ms timestamp)
 * @returns {number} Overlap in milliseconds (0 if no overlap)
 */
function intervalOverlapMs(startA, endA, startB, endB) {
    const overlapStart = Math.max(startA, startB);
    const overlapEnd = Math.min(endA, endB);
    return Math.max(0, overlapEnd - overlapStart);
}

/**
 * Computes hours of work that fall within the Night Differential window
 * (22:00–06:00). Checks multiple ND windows to handle work periods that
 * span across midnight boundaries.
 *
 * @param {Date} punchIn  - Punch in time
 * @param {Date} punchOut - Punch out time
 * @returns {number} Night differential hours (decimal, 2 places)
 */
function computeNightDifferential(punchIn, punchOut) {
    let totalNdMs = 0;

    // Get midnight of the punch-in day
    const baseDate = new Date(punchIn);
    baseDate.setHours(0, 0, 0, 0);

    // Check 3 possible ND windows: previous evening, same evening, next evening
    for (let offset = -1; offset <= 1; offset++) {
        const ndStart = new Date(baseDate);
        ndStart.setDate(ndStart.getDate() + offset);
        ndStart.setHours(22, 0, 0, 0);

        const ndEnd = new Date(ndStart);
        ndEnd.setDate(ndEnd.getDate() + 1);
        ndEnd.setHours(6, 0, 0, 0);

        totalNdMs += intervalOverlapMs(
            punchIn.getTime(),
            punchOut.getTime(),
            ndStart.getTime(),
            ndEnd.getTime()
        );
    }

    return parseFloat((totalNdMs / 3600000).toFixed(2));
}

/**
 * Computes all attendance metrics for a single work session.
 *
 * @param {Object} params
 * @param {string} params.punchInTimestamp  - ISO timestamp of punch in
 * @param {string} params.punchOutTimestamp - ISO timestamp of punch out
 * @param {string} params.scheduleStart    - "HH:MM" schedule start time
 * @param {string} params.scheduleEnd      - "HH:MM" schedule end time
 * @param {string} params.date             - "YYYY-MM-DD" date of the shift
 * @returns {Object} Computed metrics
 */
function computeMetrics({
    punchInTimestamp,
    punchOutTimestamp,
    scheduleStart,
    scheduleEnd,
    date,
}) {
    const punchIn = new Date(punchInTimestamp);
    const punchOut = new Date(punchOutTimestamp);

    // Build schedule start/end as local Date objects
    const schedStart = buildLocalDate(date, scheduleStart);
    const schedEnd = buildLocalDate(date, scheduleEnd);

    // Handle overnight shift (e.g., 22:00–06:00): end rolls to next day
    if (schedEnd.getTime() <= schedStart.getTime()) {
        schedEnd.setDate(schedEnd.getDate() + 1);
    }

    // ── Late Minutes ──
    // How many minutes after the scheduled start did the employee arrive?
    const lateMs = Math.max(0, punchIn.getTime() - schedStart.getTime());
    const lateMinutes = Math.round(lateMs / 60000);

    // ── Undertime Minutes ──
    // How many minutes before the scheduled end did the employee leave?
    const undertimeMs = Math.max(0, schedEnd.getTime() - punchOut.getTime());
    const undertimeMinutes = Math.round(undertimeMs / 60000);

    // ── Total Worked Hours ──
    // Absolute duration between punch-in and punch-out
    const totalWorkedMs = Math.max(0, punchOut.getTime() - punchIn.getTime());
    const totalWorkedHours = parseFloat((totalWorkedMs / 3600000).toFixed(2));

    // ── Regular Hours ──
    // Overlap of [punchIn, punchOut] with [schedStart, schedEnd]
    const regularMs = intervalOverlapMs(
        punchIn.getTime(),
        punchOut.getTime(),
        schedStart.getTime(),
        schedEnd.getTime()
    );
    const regularHours = parseFloat((regularMs / 3600000).toFixed(2));

    // ── Overtime Hours ──
    // Time worked after the scheduled shift end
    const overtimeMs = Math.max(0, punchOut.getTime() - schedEnd.getTime());
    const overtimeHours = parseFloat((overtimeMs / 3600000).toFixed(2));

    // ── Night Differential Hours ──
    // Overlap with the 22:00–06:00 window
    const nightDifferentialHours = computeNightDifferential(punchIn, punchOut);

    return {
        lateMinutes,
        undertimeMinutes,
        regularHours,
        overtimeHours,
        nightDifferentialHours,
        totalWorkedHours,
    };
}

module.exports = { computeMetrics };
