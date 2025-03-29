/**
 * Utility functions for date operations.
 * - getCurrentMonthYear: Returns the current month and year as a formatted string.
 */

/**
 * Returns the current month and year as a string in the format "Month YYYY"
 * @returns {string} The current month and year (e.g., "January 2023")
 */
export const getCurrentMonthYear = (): string => {
  const date = new Date();
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
};
