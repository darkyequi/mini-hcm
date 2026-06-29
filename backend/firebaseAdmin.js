const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        : undefined,
};

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