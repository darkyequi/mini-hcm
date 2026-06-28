const attendanceService = require("../services/attendanceService");

exports.punchIn = async (req, res) => {
    try {
        const result = await attendanceService.punchIn(req.user);
        res.json(result);
    } catch (err) {
        res.status(400).json({
            message: err.message,
        });
    }
};

exports.punchOut = async (req, res) => {
    try {
        const result = await attendanceService.punchOut(req.user);
        res.json(result);
    } catch (err) {
        res.status(400).json({
            message: err.message,
        });
    }
};

exports.getToday = async (req, res) => {
    try {
        const result = await attendanceService.getToday(req.user);
        res.json(result);
    } catch (err) {
        res.status(400).json({
            message: err.message,
        });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const result = await attendanceService.getHistory(req.user);
        res.json(result);
    } catch (err) {
        res.status(400).json({
            message: err.message,
        });
    }
};

exports.adminEditAttendance = async (req, res) => {
    try {
        const { summaryId } = req.params;
        const { timeIn, timeOut } = req.body;
        const result = await attendanceService.adminEditAttendance(summaryId, {
            timeIn,
            timeOut,
        });
        res.json({ summary: result, message: "Attendance updated successfully." });
    } catch (err) {
        res.status(400).json({
            message: err.message,
        });
    }
};
