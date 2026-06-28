const { admin, db } = require("../firebaseAdmin");
const adminAuth = admin.auth();

const seedUsers = async () => {
  const usersToCreate = [
    {
      email: "admin@minihcm.com",
      password: "password123",
      firstName: "System",
      lastName: "Admin",
      timeZone: "UTC",
      role: "admin",
    },
    {
      email: "user@minihcm.com",
      password: "password123",
      firstName: "Standard",
      lastName: "Employee",
      timeZone: "UTC",
      role: "user",
    },
    {
      email: "user1@minihcm.com",
      password: "password123",
      firstName: "Standard",
      lastName: "Employee",
      timeZone: "UTC",
      role: "user",
    }
  ];

  console.log("Starting to seed accounts...");

  for (const userData of usersToCreate) {
    try {
      let userRecord;
      // 1. Check if the user already exists in Firebase Auth by email
      try {
        userRecord = await adminAuth.getUserByEmail(userData.email);
        console.log(`User [${userData.email}] already exists in Auth (UID: ${userRecord.uid}). Updating password...`);
        // Optional: Update password just to be sure
        await adminAuth.updateUser(userRecord.uid, { password: userData.password });
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          // 2. Create the user in Firebase Auth if they don't exist
          userRecord = await adminAuth.createUser({
            email: userData.email,
            password: userData.password,
            displayName: `${userData.firstName} ${userData.lastName}`,
          });
          console.log(`Created user [${userData.email}] in Auth (UID: ${userRecord.uid}).`);
        } else {
          throw error;
        }
      }

      // 3. Create or overwrite the user document in Firestore
      await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        timeZone: userData.timeZone,
        role: userData.role,
        createdAt: new Date(),
      });
      console.log(`Saved user [${userData.email}] to Firestore as role: [${userData.role}].`);
      
    } catch (err) {
      console.error(`Error seeding user [${userData.email}]:`, err);
    }
  }

  console.log("Seeding process finished successfully!");
  process.exit();
};

seedUsers();
