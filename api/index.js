let app;
let initError;

try {
    app = require("../backend/server");
} catch (err) {
    console.error("Failed to initialize backend:", err);
    initError = err;
}

module.exports = (req, res) => {
    if (initError) {
        return res.status(500).json({
            error: "Server initialization failed",
            message: initError.message,
        });
    }
    return app(req, res);
};