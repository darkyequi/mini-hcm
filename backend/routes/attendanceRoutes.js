const express = require("express");
const verifyToken = require("../middleware/auth");
const attendanceController = require("../controllers/attendanceController");

const router = express.Router();

router.post("/punch-in", verifyToken, attendanceController.punchIn);
router.post("/punch-out", verifyToken, attendanceController.punchOut);
router.get("/today", verifyToken, attendanceController.getToday);
router.get("/history", verifyToken, attendanceController.getHistory);
router.put("/admin/edit/:summaryId", verifyToken, attendanceController.adminEditAttendance);

module.exports = router;
