/**
 * src/index.js - PimeRig Express server entry point
 *
 * Sets up middleware, mounts routes, starts the HTTP server.
 */

require("dotenv").config();
const express     = require("express");
const cors        = require("cors");
const routes      = require("./routes/index");
const errorHandler = require("./middleware/errorHandler");

// Initialize the DB pool (connection test happens on import)
require("./db");

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────
app.use("/api", routes);

// Health-check endpoint
app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date() }));

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 PimeRig backend running on http://localhost:${PORT}`);
});

module.exports = app;
