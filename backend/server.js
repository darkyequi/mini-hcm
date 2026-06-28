const express = require("express");
const cors = require("cors");

// Initialize Firebase Admin (must happen before routes)
require("./firebaseAdmin");

const attendanceRoutes = require("./routes/attendanceRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// ── Routes ──
app.use("/api/attendance", attendanceRoutes);

app.listen(5000, () => {
    console.log("Server running on port 5000");
});