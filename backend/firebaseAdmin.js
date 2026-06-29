const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

let serviceAccount;

if (process.env.FIREBASE_PROJECT_ID) {
    serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY
            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
            : undefined,
    };
} else {
    try {
        serviceAccount = require("./serviceAccountKey.json");
    } catch (err) {
        throw new Error("Missing FIREBASE_PROJECT_ID env var and serviceAccountKey.json file not found.");
    }
}

// Prevent re-initializing on serverless warm starts
const app = getApps().length
    ? getApps()[0]
    : initializeApp({
          credential: cert(serviceAccount),
      });

const db = getFirestore(app);
const adminAuth = getAuth(app);

module.exports = {
    admin: {
        auth: () => adminAuth,
    },
    db,
};