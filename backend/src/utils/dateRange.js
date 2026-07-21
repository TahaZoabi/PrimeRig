/**
 * utils/dateRange.js
 *
 * Shared period → date-range resolution, used by both the admin dashboard
 * stats endpoint and the admin orders endpoint so the two filters behave
 * identically and the logic isn't duplicated between controllers.
 */

const PERIODS = ["today", "7d", "30d", "3m", "6m", "1y", "all", "custom"];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A validation failure that should be surfaced as a 400, not a 500.
 */
class InvalidRangeError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

/**
 * Resolve a period key (+ optional custom dates) into a concrete date range,
 * plus the equal-length preceding range used for growth comparisons.
 * `start === null` means "no lower bound" (All Time).
 *
 * Throws InvalidRangeError for a "custom" period with unparsable or
 * inverted dates — callers should catch this and return a 400.
 */
function resolveRange(period, startDateParam, endDateParam) {
  const now = new Date();
  let start = null;
  let end = now;

  switch (period) {
    case "today":
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    case "7d":
      start = new Date(now.getTime() - 7 * DAY_MS);
      break;
    case "30d":
      start = new Date(now.getTime() - 30 * DAY_MS);
      break;
    case "3m":
      start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      break;
    case "6m":
      start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      break;
    case "1y":
      start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "custom": {
      const parsedStart = new Date(`${startDateParam}T00:00:00`);
      const parsedEnd = new Date(`${endDateParam}T23:59:59`);
      if (
        Number.isNaN(parsedStart.getTime()) ||
        Number.isNaN(parsedEnd.getTime())
      ) {
        throw new InvalidRangeError(
          "startDate/endDate must be valid dates (YYYY-MM-DD)",
        );
      }
      if (parsedStart.getTime() > parsedEnd.getTime()) {
        throw new InvalidRangeError("startDate must not be after endDate");
      }
      start = parsedStart;
      end = parsedEnd;
      break;
    }
    case "all":
    default:
      start = null;
      break;
  }

  // Equal-length preceding period, used only for growth comparisons.
  // Not meaningful for "All Time" (no bounded length to mirror).
  let prevStart = null;
  let prevEnd = null;
  if (start) {
    const length = end.getTime() - start.getTime();
    prevEnd = new Date(start.getTime());
    prevStart = new Date(start.getTime() - length);
  }

  return { start, end, prevStart, prevEnd };
}

module.exports = { PERIODS, DAY_MS, resolveRange, InvalidRangeError };
