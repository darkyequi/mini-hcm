// const { admin, db } = require("../firebaseAdmin");
// const adminAuth = admin.auth();

// const seedUsers = async () => {
//   const usersToCreate = [
//     {
//       email: "admin@minihcm.com",
//       password: "password123",
//       firstName: "System",
//       lastName: "Admin",
//       timeZone: "UTC",
//       role: "admin",
//     },
//     {
//       email: "user@minihcm.com",
//       password: "password123",
//       firstName: "Standard",
//       lastName: "Employee",
//       timeZone: "UTC",
//       role: "user",
//     },
//     {
//       email: "user1@minihcm.com",
//       password: "password123",
//       firstName: "Standard",
//       lastName: "Employee",
//       timeZone: "UTC",
//       role: "user",
//     }
//   ];

//   console.log("Starting to seed accounts...");

//   for (const userData of usersToCreate) {
//     try {
//       let userRecord;
//       // 1. Check if the user already exists in Firebase Auth by email
//       try {
//         userRecord = await adminAuth.getUserByEmail(userData.email);
//         console.log(`User [${userData.email}] already exists in Auth (UID: ${userRecord.uid}). Updating password...`);
//         // Optional: Update password just to be sure
//         await adminAuth.updateUser(userRecord.uid, { password: userData.password });
//       } catch (error) {
//         if (error.code === 'auth/user-not-found') {
//           // 2. Create the user in Firebase Auth if they don't exist
//           userRecord = await adminAuth.createUser({
//             email: userData.email,
//             password: userData.password,
//             displayName: `${userData.firstName} ${userData.lastName}`,
//           });
//           console.log(`Created user [${userData.email}] in Auth (UID: ${userRecord.uid}).`);
//         } else {
//           throw error;
//         }
//       }

//       // 3. Create or overwrite the user document in Firestore
//       await db.collection("users").doc(userRecord.uid).set({
//         uid: userRecord.uid,
//         email: userData.email,
//         firstName: userData.firstName,
//         lastName: userData.lastName,
//         timeZone: userData.timeZone,
//         role: userData.role,
//         createdAt: new Date(),
//       });
//       console.log(`Saved user [${userData.email}] to Firestore as role: [${userData.role}].`);
      
//     } catch (err) {
//       console.error(`Error seeding user [${userData.email}]:`, err);
//     }
//   }

//   console.log("Seeding process finished successfully!");
//   process.exit();
// };

// seedUsers();
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
  d.setUTCHours(hours - 8, minutes, 0, 0);
  return d.toISOString();
};

const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

// Attendance scenarios
const scenarios = [
  {
    morning: { in: "08:00", out: "17:00" },
    night: { in: "22:00", out: "07:00" }
  },
  {
    morning: { in: "08:25", out: "17:00" },
    night: { in: "22:20", out: "07:00" }
  },
  {
    morning: { in: "08:00", out: "16:20" },
    night: { in: "22:00", out: "06:20" }
  },
  {
    morning: { in: "07:55", out: "18:30" },
    night: { in: "21:55", out: "08:15" }
  },
  {
    morning: { in: "08:15", out: "18:00" },
    night: { in: "22:10", out: "08:00" }
  },
  {
    morning: { in: "08:35", out: "16:15" },
    night: { in: "22:30", out: "06:15" }
  },
  {
    morning: { in: "07:58", out: "17:05" },
    night: { in: "21:58", out: "07:05" }
  }
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
        scheduleStart: "08:00",
        scheduleEnd: "17:00",
        scheduleId: "morning_shift_seed",
        shift: "morning"
      },
      {
        uid: user2Auth.uid,
        ...user2,
        scheduleStart: "22:00",
        scheduleEnd: "07:00",
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

        const shift =
          emp.shift === "morning"
            ? scenario.morning
            : scenario.night;

        let inTime = shift.in;
        let outTime = shift.out;

        const punchIn = createTimestamp(date, inTime);

        let punchOutDate = new Date(date);

        if (emp.shift === "night") {
          punchOutDate.setDate(punchOutDate.getDate() + 1);
        }

        const punchOut = createTimestamp(punchOutDate, outTime);

        const scheduleStart =
          emp.shift === "morning"
            ? toMinutes("08:00")
            : toMinutes("22:00");

        const scheduleEnd =
          emp.shift === "morning"
            ? toMinutes("17:00")
            : toMinutes("07:00") + 1440;

        const actualIn =
          emp.shift === "morning"
            ? toMinutes(inTime)
            : toMinutes(inTime);

        const actualOut =
          emp.shift === "morning"
            ? toMinutes(outTime)
            : toMinutes(outTime) + 1440;

        const lateMinutes = Math.max(actualIn - scheduleStart, 0);
        const undertimeMinutes = Math.max(scheduleEnd - actualOut, 0);
        const overtimeMinutes = Math.max(actualOut - scheduleEnd, 0);

        const workedHours = Number(
          ((actualOut - actualIn) / 60).toFixed(2)
        );

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
          date:
            emp.shift === "night"
              ? formatDate(punchOutDate)
              : dateStr,
          timestamp: punchOut,
          type: "OUT"
        });

        // Daily Summary
        batch.set(
          db.collection("dailySummary").doc(`${emp.uid}_${dateStr}`),
          {
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),

            userId: emp.uid,
            userName,
            firstName: emp.firstName,
            lastName: emp.lastName,
            email: emp.email,

            date: dateStr,

            scheduleId: emp.scheduleId,
            scheduleStart: emp.scheduleStart,
            scheduleEnd: emp.scheduleEnd,

            punchInTimestamp: punchIn,
            punchOutTimestamp: punchOut,

            timeIn: inTime,
            timeOut: outTime,

            regularHours: 8,
            totalWorkedHours: workedHours,

            lateMinutes,
            undertimeMinutes,
            overtimeHours: Number((overtimeMinutes / 60).toFixed(2)),

            nightDifferentialHours:
              emp.shift === "night" ? 7 : 0,

            status: "Completed"
          }
        );
      }
    }

    await batch.commit();

    console.log("===================================");
    console.log("Attendance seeded successfully!");
    console.log("7 days of records created.");
    console.log("Morning employee:", `${user1.firstName} ${user1.lastName}`);
    console.log("Night employee:", `${user2.firstName} ${user2.lastName}`);
    console.log("===================================");

    process.exit(0);

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seedAttendance();