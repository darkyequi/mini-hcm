const { FieldValue } = require("firebase-admin/firestore");
const { admin, db } = require("../firebaseAdmin");
const adminAuth = admin.auth();

// Set up dates for the last 7 days (e.g., June 21 to June 27, 2026)
// We will generate the dates dynamically based on current date
const generatePastDates = (days) => {
  const dates = [];
  for (let i = days; i > 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d);
  }
  return dates;
};

// Formatting helpers
const formatDate = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const createTimestamp = (date, timeStr) => {
  // timeStr is like "08:00" in UTC+8
  const [hours, minutes] = timeStr.split(':');
  const d = new Date(date.getTime());
  // Set time in UTC+8 (subtract 8 hours for UTC)
  d.setUTCHours(parseInt(hours) - 8, parseInt(minutes), 0, 0);
  return d.toISOString();
};

const seedAttendance = async () => {
  try {
    // 1. Get UIDs for user1 and user
    let user1Record, userRecord;
    try {
      user1Record = await adminAuth.getUserByEmail('user1@minihcm.com');
      userRecord = await adminAuth.getUserByEmail('user@minihcm.com');
    } catch (e) {
      console.error("Error fetching users. Make sure you ran seedAccounts.js first.", e.message);
      process.exit(1);
    }

    const user1Id = user1Record.uid;
    const userId = userRecord.uid;

    const dates = generatePastDates(7);
    console.log(`Seeding attendance for 7 days...`);

    const batch = db.batch();
    
    dates.forEach(date => {
      const dateStr = formatDate(date);
      
      // ==========================================
      // USER 1: MORNING SHIFT (08:00 - 17:00)
      // ==========================================
      const u1PunchIn = createTimestamp(date, "07:55");
      const u1PunchOut = createTimestamp(date, "17:05");
      
      // Attendance IN
      const u1InRef = db.collection("attendance").doc();
      batch.set(u1InRef, {
        date: dateStr,
        timestamp: u1PunchIn,
        type: "IN",
        userId: user1Id
      });

      // Attendance OUT
      const u1OutRef = db.collection("attendance").doc();
      batch.set(u1OutRef, {
        date: dateStr,
        timestamp: u1PunchOut,
        type: "OUT",
        userId: user1Id
      });

      // Daily Summary
      const u1SummaryRef = db.collection("dailySummary").doc(`${user1Id}_${dateStr}`);
      batch.set(u1SummaryRef, {
        createdAt: FieldValue.serverTimestamp(),
        date: dateStr,
        lateMinutes: 0,
        nightDifferentialHours: 0,
        overtimeHours: 0.08,
        punchInTimestamp: u1PunchIn,
        punchOutTimestamp: u1PunchOut,
        regularHours: 8,
        scheduleEnd: "17:00",
        scheduleId: "morning_shift_seed",
        scheduleStart: "08:00",
        status: "Completed",
        timeIn: "07:55",
        timeOut: "17:05",
        totalWorkedHours: 8.08,
        undertimeMinutes: 0,
        updatedAt: FieldValue.serverTimestamp(),
        userId: user1Id
      });

      // ==========================================
      // USER: NIGHT SHIFT (22:00 - 07:00)
      // ==========================================
      // Note: For night shift, the Punch Out happens the next day. 
      // But we record it under the schedule start date.
      const u2PunchIn = createTimestamp(date, "21:55");
      
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const u2PunchOut = createTimestamp(nextDay, "07:05");

      // Attendance IN
      const u2InRef = db.collection("attendance").doc();
      batch.set(u2InRef, {
        date: dateStr,
        timestamp: u2PunchIn,
        type: "IN",
        userId: userId
      });

      // Attendance OUT (Usually recorded on the next day's date string if we just check local time, 
      // but for logical grouping, it's tied to the shift date or the actual date.
      // We will use the actual date string for the out punch to mimic real life)
      const nextDateStr = formatDate(nextDay);
      const u2OutRef = db.collection("attendance").doc();
      batch.set(u2OutRef, {
        date: nextDateStr,
        timestamp: u2PunchOut,
        type: "OUT",
        userId: userId
      });

      // Daily Summary (Tied to the shift start date)
      const u2SummaryRef = db.collection("dailySummary").doc(`${userId}_${dateStr}`);
      batch.set(u2SummaryRef, {
        createdAt: FieldValue.serverTimestamp(),
        date: dateStr,
        lateMinutes: 0,
        nightDifferentialHours: 7, // Typically 10pm to 6am = 8 hours - 1 hour break = 7
        overtimeHours: 0.08,
        punchInTimestamp: u2PunchIn,
        punchOutTimestamp: u2PunchOut,
        regularHours: 8,
        scheduleEnd: "07:00",
        scheduleId: "night_shift_seed",
        scheduleStart: "22:00",
        status: "Completed",
        timeIn: "21:55",
        timeOut: "07:05",
        totalWorkedHours: 8.08,
        undertimeMinutes: 0,
        updatedAt: FieldValue.serverTimestamp(),
        userId: userId
      });
    });

    await batch.commit();
    console.log("Successfully seeded 1 week of attendance and daily summaries!");
    process.exit(0);

  } catch (error) {
    console.error("Failed to seed attendance data:", error);
    process.exit(1);
  }
};

seedAttendance();
