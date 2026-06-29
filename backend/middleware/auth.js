const { admin } = require("../firebaseAdmin");

const verifyToken = async (req, res, next) => {
    try {
        const header = req.headers.authorization;

        if (!header || !header.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "No authentication token."
            });
        }

        const token = header.split(" ")[1];
        const decoded = await admin.auth().verifyIdToken(token);

        req.user = {
            uid: decoded.uid,
            email: decoded.email,
        };

        next();
    } catch (err) {
        console.error(err);
        return res.status(401).json({
            message: "Invalid authentication token."
        });
    }
};

module.exports = verifyToken;
