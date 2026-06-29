const { db } = require("../firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { computeMetrics } = require("../utils/attendanceCalculator");

// ══════════════════════════════════════════════
// ── Helpers
// ══════════════════════════════════════════════

/**
 * Returns today's date as "YYYY-MM-DD" in local time.
 */
function getTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Returns the current time as "HH:MM" in local time.
 */
function getCurrentTimeString() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

/**
 * Finds the user's active schedule that covers today's date.
 * Queries all schedules for the user and filters in-code
 * (Firestore doesn't support inequality filters on multiple fields).
 */
async function getActiveSchedule(userId) {
    const today = getTodayDate();
    const snap = await db
        .collection("schedules")
        .where("userId", "==", userId)
        .get();

    const schedule = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .find((s) => s.startDate <= today && s.endDate >= today);

    return schedule || null;
}

// ══════════════════════════════════════════════
// ── Punch In
// ══════════════════════════════════════════════

exports.punchIn = async (user) => {
    const today = getTodayDate();
    const now = new Date();
    const timeString = getCurrentTimeString();

    // Get active schedule
    const schedule = await getActiveSchedule(user.uid);
    if (!schedule) {
        throw new Error(
            "No active schedule found for today. Please contact your administrator."
        );
    }

    // Deterministic doc ID prevents duplicate dailySummary per user per day
    const summaryDocId = `${user.uid}_${today}`;
    const summaryRef = db.collection("dailySummary").doc(summaryDocId);

    const summaryData = await db.runTransaction(async (t) => {
        const existingDoc = await t.get(summaryRef);

        if (existingDoc.exists) {
            const data = existingDoc.data();
            if (data.status === "In Progress") {
                throw new Error(
                    "You already have an active punch-in. Please punch out first."
                );
            }
            if (data.status === "Completed") {
                throw new Error(
                    "You have already completed your attendance for today."
                );
            }
        }

        const attendanceRef = db.collection("attendance").doc();

        const data = {
            userId: user.uid,
            userName: schedule.userName || "",
            email: schedule.email || user.email || "",
            date: today,
            scheduleId: schedule.id,
            scheduleStart: schedule.shiftStart,
            scheduleEnd: schedule.shiftEnd,
            timeIn: timeString,
            timeOut: null,
            punchInTimestamp: now.toISOString(),
            punchOutTimestamp: null,
            regularHours: 0,
            overtimeHours: 0,
            nightDifferentialHours: 0,
            lateMinutes: 0,
            undertimeMinutes: 0,
            totalWorkedHours: 0,
            status: "In Progress",
            createdAt: FieldValue.serverTimestamp(),
        };

        t.set(summaryRef, data);
        t.set(attendanceRef, {
            userId: user.uid,
            type: "IN",
            timestamp: now.toISOString(),
            date: today,
        });

        return { id: summaryDocId, ...data };
    });

    return { summary: summaryData, message: "Punched in successfully." };
};

// ══════════════════════════════════════════════
// ── Punch Out
// ══════════════════════════════════════════════

exports.punchOut = async (user) => {
    const now = new Date();
    const timeString = getCurrentTimeString();

    // Find the in-progress summary (may be from a previous day for overnight shifts)
    const snap = await db
        .collection("dailySummary")
        .where("userId", "==", user.uid)
        .where("status", "==", "In Progress")
        .limit(1)
        .get();

    if (snap.empty) {
        throw new Error("No active punch-in found. Please punch in first.");
    }

    const summaryDoc = snap.docs[0];
    const summaryData = summaryDoc.data();
    const summaryRef = summaryDoc.ref;

    // Compute attendance metrics on the backend
    const metrics = computeMetrics({
        punchInTimestamp: summaryData.punchInTimestamp,
        punchOutTimestamp: now.toISOString(),
        scheduleStart: summaryData.scheduleStart,
        scheduleEnd: summaryData.scheduleEnd,
        date: summaryData.date,
    });

    const updateData = {
        timeOut: timeString,
        punchOutTimestamp: now.toISOString(),
        ...metrics,
        status: "Completed",
        updatedAt: FieldValue.serverTimestamp(),
    };

    // Transaction ensures atomicity: verify still in-progress, then update
    await db.runTransaction(async (t) => {
        const freshDoc = await t.get(summaryRef);
        if (!freshDoc.exists || freshDoc.data().status !== "In Progress") {
            throw new Error("Attendance record is no longer in progress.");
        }

        const attendanceRef = db.collection("attendance").doc();

        t.update(summaryRef, updateData);
        t.set(attendanceRef, {
            userId: user.uid,
            type: "OUT",
            timestamp: now.toISOString(),
            date: summaryData.date, // Original shift date, not today
        });
    });

    const updatedSummary = {
        id: summaryDoc.id,
        ...summaryData,
        ...updateData,
    };

    return { summary: updatedSummary, message: "Punched out successfully." };
};

// ══════════════════════════════════════════════
// ── Get Today's Summary + Schedule
// ══════════════════════════════════════════════

exports.getToday = async (user) => {
    const today = getTodayDate();

    // 1. Check for any in-progress summary (handles overnight shifts)
    const inProgressSnap = await db
        .collection("dailySummary")
        .where("userId", "==", user.uid)
        .where("status", "==", "In Progress")
        .limit(1)
        .get();

    if (!inProgressSnap.empty) {
        const doc = inProgressSnap.docs[0];
        return {
            summary: { id: doc.id, ...doc.data() },
            schedule: null,
        };
    }

    // 2. Check for today's completed summary
    const summaryDocId = `${user.uid}_${today}`;
    const summaryDoc = await db
        .collection("dailySummary")
        .doc(summaryDocId)
        .get();

    // 3. Also fetch active schedule for display on the dashboard
    const schedule = await getActiveSchedule(user.uid);

    return {
        summary: summaryDoc.exists
            ? { id: summaryDoc.id, ...summaryDoc.data() }
            : null,
        schedule: schedule || null,
    };
};

// ══════════════════════════════════════════════
// ── Get Attendance History
// ══════════════════════════════════════════════

exports.getHistory = async (user) => {
    const snap = await db
        .collection("dailySummary")
        .where("userId", "==", user.uid)
        .orderBy("date", "desc")
        .get();

    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ══════════════════════════════════════════════
// ── Admin: Edit Attendance Record
// ══════════════════════════════════════════════

exports.adminEditAttendance = async (summaryId, { timeIn, timeOut }) => {
    const summaryRef = db.collection("dailySummary").doc(summaryId);
    const summaryDoc = await summaryRef.get();

    if (!summaryDoc.exists) {
        throw new Error("Attendance record not found.");
    }

    const data = summaryDoc.data();

    // Build full ISO timestamps from the date + time strings
    const punchInTimestamp = new Date(`${data.date}T${timeIn}:00`).toISOString();
    let punchOutTimestamp;

    if (timeOut) {
        // Handle overnight: if timeOut < timeIn, assume next day
        const outDate = new Date(`${data.date}T${timeOut}:00`);
        const inDate = new Date(`${data.date}T${timeIn}:00`);
        if (outDate <= inDate) {
            outDate.setDate(outDate.getDate() + 1);
        }
        punchOutTimestamp = outDate.toISOString();
    }

    const updateData = {
        timeIn,
        punchInTimestamp,
        updatedAt: FieldValue.serverTimestamp(),
    };

    // Only recalculate metrics if we have both punch in and out
    if (timeOut && punchOutTimestamp) {
        const metrics = computeMetrics({
            punchInTimestamp,
            punchOutTimestamp,
            scheduleStart: data.scheduleStart,
            scheduleEnd: data.scheduleEnd,
            date: data.date,
        });

        updateData.timeOut = timeOut;
        updateData.punchOutTimestamp = punchOutTimestamp;
        Object.assign(updateData, metrics);
        updateData.status = "Completed";
    }

    await summaryRef.update(updateData);

    const updatedDoc = await summaryRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() };
};
