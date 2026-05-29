/**
 * Pure utility functions for engineer assignment and scheduling.
 * No I/O or database calls — all functions are deterministic and side-effect-free.
 */

/**
 * Computes the daily slot capacity for an engineer based on their joining time.
 * Slots are 1-hour blocks from joiningTime until 18:00 (1080 minutes).
 *
 * @param {string} joiningTime - Time string in "HH:MM" format (24-hour)
 * @returns {number} Number of available slots (floor of remaining hours until 18:00)
 */
export function computeDailySlotCapacity(joiningTime) {
  const [hhStr, mmStr] = joiningTime.split(':');
  const HH = parseInt(hhStr, 10);
  const MM = parseInt(mmStr, 10);
  return Math.floor((1080 - (HH * 60 + MM)) / 60);
}

/**
 * Validates a joining time string.
 * Valid if: matches /^\d{2}:\d{2}$/, represents a valid clock time,
 * and total minutes are strictly less than 1080 (i.e., before 18:00).
 *
 * @param {string} joiningTime - Value to validate
 * @returns {boolean} true if valid, false otherwise
 */
export function validateJoiningTime(joiningTime) {
  if (typeof joiningTime !== 'string') return false;
  if (!/^\d{2}:\d{2}$/.test(joiningTime)) return false;

  const [hhStr, mmStr] = joiningTime.split(':');
  const HH = parseInt(hhStr, 10);
  const MM = parseInt(mmStr, 10);

  // Valid clock time: hours 0–23, minutes 0–59
  if (HH < 0 || HH > 23) return false;
  if (MM < 0 || MM > 59) return false;

  // Must be strictly before 18:00 (total minutes < 1080)
  const totalMinutes = HH * 60 + MM;
  if (totalMinutes >= 1080) return false;

  return true;
}

/**
 * Computes the remaining slots for an engineer today, given their daily capacity
 * and the list of complaints assigned to them.
 * Cancelled complaints do not consume slots.
 * Result is clamped to [0, dailySlotCapacity].
 *
 * @param {number} dailySlotCapacity - Total slots available per day
 * @param {Array<{status: string}>} assignedComplaints - Complaints assigned to the engineer
 * @returns {number} Remaining slots, clamped to [0, dailySlotCapacity]
 */
export function computeRemainingSlotsToday(dailySlotCapacity, assignedComplaints) {
  const nonCancelledCount = assignedComplaints.filter(
    (c) => c.status !== 'Cancelled'
  ).length;
  const remaining = dailySlotCapacity - nonCancelledCount;
  return Math.max(0, Math.min(dailySlotCapacity, remaining));
}

/**
 * Sorts an array of engineers by remainingSlotsToday in descending order.
 * Returns a new array (stable sort — original array is not mutated).
 *
 * @param {Array<{remainingSlotsToday: number}>} engineers - Engineers to sort
 * @returns {Array} New sorted array
 */
export function sortEngineersBySlots(engineers) {
  return [...engineers].sort(
    (a, b) => b.remainingSlotsToday - a.remainingSlotsToday
  );
}

/**
 * Sorts an array of complaints by preferredDate in ascending order.
 * Uses lexicographic comparison, which is correct for YYYY-MM-DD strings.
 * Returns a new array (original array is not mutated).
 *
 * @param {Array<{preferredDate: string}>} complaints - Complaints to sort
 * @returns {Array} New sorted array
 */
export function sortComplaintsByDate(complaints) {
  return [...complaints].sort((a, b) => {
    if (a.preferredDate < b.preferredDate) return -1;
    if (a.preferredDate > b.preferredDate) return 1;
    return 0;
  });
}

/**
 * Filters complaints to only those assigned to a specific engineer (by userId).
 * Handles both populated (object with _id) and unpopulated (raw ObjectId/string) references.
 *
 * @param {Array} complaints - All complaints
 * @param {string|Object} userId - The engineer's User ID to filter by
 * @returns {Array} Complaints assigned to the given userId
 */
export function filterComplaintsForEngineer(complaints, userId) {
  return complaints.filter(
    (c) =>
      String(c.assignedTechnician?._id ?? c.assignedTechnician) === String(userId)
  );
}
