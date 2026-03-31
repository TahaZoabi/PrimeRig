/**
 * middleware/errorHandler.js
 *
 * Global Express error handler.
 * Returns consistent JSON error responses.
 */

const errorHandler = (err, req, res, next) => {
  console.error("❌ Error:", err.message);

  // MySQL duplicate entry
  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ error: "A record with that value already exists" });
  }

  // MySQL foreign key violation
  if (err.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({ error: "Cannot delete: record is referenced by other data" });
  }

  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    error: err.message || "Internal server error",
  });
};

module.exports = errorHandler;
