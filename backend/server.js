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

// Only start HTTP server when running locally (not on Vercel)
if (!process.env.VERCEL) {
    app.listen(5000, () => {
        console.log("Server running on port 5000");
    });
}

module.exports = app;