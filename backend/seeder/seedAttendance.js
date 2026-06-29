const { FieldValue } = require("firebase-admin/firestore");
const { admin, db } = require("../firebaseAdmin");

const adminAuth = admin.auth();

// Generate past dates
const generatePastDates = (days) => {
  const dates = [];
  for (let i = days; i > 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d);
  }
  return dates;
};

const formatDate = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const createTimestamp = (date, timeStr) => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date(date.getTime());
  d.setUTCHours(hours - 8, minutes, 0, 0); // Assuming UTC+8 adjustment
  return d.toISOString();
};

const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

// Attendance scenarios (Morning: 06:00-14:00, Night: 22:00-06:00)
const scenarios = [
  { morning: { in: "06:00", out: "14:00" }, night: { in: "22:00", out: "06:00" } }, // Perfect
  { morning: { in: "06:20", out: "14:00" }, night: { in: "22:20", out: "06:00" } }, // Late
  { morning: { in: "06:00", out: "13:20" }, night: { in: "22:00", out: "05:20" } }, // Undertime
  { morning: { in: "05:55", out: "15:15" }, night: { in: "21:55", out: "07:15" } }, // Overtime
  { morning: { in: "06:15", out: "15:00" }, night: { in: "22:15", out: "07:00" } }, // Late + Overtime
  { morning: { in: "06:30", out: "13:30" }, night: { in: "22:30", out: "05:30" } }, // Late + Undertime
  { morning: { in: "05:58", out: "14:10" }, night: { in: "21:58", out: "06:10" } }  // Slight Overtime
];

async function seedAttendance() {
  try {
    const user1Auth = await adminAuth.getUserByEmail("user1@minihcm.com");
    const user2Auth = await adminAuth.getUserByEmail("user@minihcm.com");

    const user1Doc = await db.collection("users").doc(user1Auth.uid).get();
    const user2Doc = await db.collection("users").doc(user2Auth.uid).get();

    const user1 = user1Doc.data();
    const user2 = user2Doc.data();

    const employees = [
      {
        uid: user1Auth.uid,
        ...user1,
        scheduleStart: "06:00",
        scheduleEnd: "14:00",
        scheduleId: "morning_shift_seed",
        shift: "morning"
      },
      {
        uid: user2Auth.uid,
        ...user2,
        scheduleStart: "22:00",
        scheduleEnd: "06:00",
        scheduleId: "night_shift_seed",
        shift: "night"
      }
    ];

    const dates = generatePastDates(7);
    const batch = db.batch();

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const dateStr = formatDate(date);
      const scenario = scenarios[i];

      for (const emp of employees) {
        const shift = emp.shift === "morning" ? scenario.morning : scenario.night;

        let inTime = shift.in;
        let outTime = shift.out;

        // Setup Timestamps properly handling dates
        const punchIn = createTimestamp(date, inTime);
        let punchOutDate = new Date(date);

        // If night shift and outTime crossed midnight (e.g. 05:00, 06:00, 07:00), push date forward
        if (emp.shift === "night" && toMinutes(outTime) < toMinutes(inTime)) {
          punchOutDate.setDate(punchOutDate.getDate() + 1);
        }
        const punchOut = createTimestamp(punchOutDate, outTime);

        // Normalize minutes to an absolute absolute timeline mapping
        let schStartMin = toMinutes(emp.scheduleStart);
        let schEndMin = toMinutes(emp.scheduleEnd);
        if (schEndMin < schStartMin) schEndMin += 1440; // Handles 22:00 to 06:00 (+1440)

        let actInMin = toMinutes(inTime);
        let actOutMin = toMinutes(outTime);

        // Adjust actual times relative to the timeline
        if (emp.shift === "night") {
          // If clocked in early morning next day (e.g., 00:15 vs 22:00 schedule)
          if (actInMin < 600) actInMin += 1440;
          // If clocked out next morning (e.g., 06:00 vs 22:00 schedule)
          if (actOutMin < actInMin || actOutMin < 600) actOutMin += 1440;
        }

        // Metrics calculations
        const lateMinutes = Math.max(actInMin - schStartMin, 0);
        const undertimeMinutes = Math.max(schEndMin - actOutMin, 0);
        const overtimeMinutes = Math.max(actOutMin - schEndMin, 0);

        const totalWorkedMinutes = Math.max(actOutMin - actInMin, 0);
        const totalWorkedHours = Number((totalWorkedMinutes / 60).toFixed(2));

        // Calculate dynamic regular hours capped at 8 max
        const baseScheduledMinutes = schEndMin - schStartMin; // 480 mins (8 hours)
        const lossMinutes = lateMinutes + undertimeMinutes;
        const regularHours = Number((Math.max(baseScheduledMinutes - lossMinutes, 0) / 60).toFixed(2));

        // Night Differential (22:00 to 06:00 window)
        let nightDifferentialHours = 0;
        if (emp.shift === "night") {
          // ND is earned only during the scheduled ND window, excluding late/undertime
          nightDifferentialHours = regularHours;
        }

        const userName = `${emp.firstName} ${emp.lastName}`;

        // Attendance IN
        batch.set(db.collection("attendance").doc(), {
          userId: emp.uid,
          userName,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          date: dateStr,
          timestamp: punchIn,
          type: "IN"
        });

        // Attendance OUT
        batch.set(db.collection("attendance").doc(), {
          userId: emp.uid,
          userName,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          date: emp.shift === "night" ? formatDate(punchOutDate) : dateStr,
          timestamp: punchOut,
          type: "OUT"
        });

        // Daily Summary
        // Daily Summary
        batch.set(
          db.collection("dailySummary").doc(`${emp.uid}_${dateStr}`),
          {
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            userId: emp.uid,
            userName,
            email: emp.email,
            date: dateStr,
            scheduleId: emp.scheduleId,
            scheduleStart: emp.scheduleStart,
            scheduleEnd: emp.scheduleEnd,
            punchInTimestamp: punchIn,
            punchOutTimestamp: punchOut,
            timeIn: inTime,
            timeOut: outTime,
            shiftType: emp.shift,
            regularHours,
            totalWorkedHours,
            lateMinutes,
            undertimeMinutes,
            overtimeHours: Number((overtimeMinutes / 60).toFixed(2)),
            nightDifferentialHours,
            status: "Completed"
          }
        );
      }
    }

    await batch.commit();

    console.log("===================================");
    console.log("Attendance seeded successfully!");
    console.log("7 days of records created.");
    console.log("===================================");

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seedAttendance();