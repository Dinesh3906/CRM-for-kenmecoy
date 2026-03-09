/**
 * Utility functions for invoice numbering
 */

/**
 * Get financial year string from a date
 * Financial year: April to March (FY2526 = Apr 2025 - Mar 2026)
 * @param {Date} date - The date to calculate FY for
 * @param {Number} fyOffset - Offset to add to Gregorian year (default: 500)
 * @returns {String} Financial year in format "YYYY" (e.g., "2526")
 */
function getFinancialYear(date, fyOffset = 500) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed (0 = Jan, 3 = Apr, 11 = Dec)
    
    // If date is before April (month < 3), it belongs to previous FY
    // April onwards (month >= 3) belongs to current FY
    const fyYear = month < 3 ? year - 1 : year;
    const fy = fyYear + fyOffset;
    
    return String(fy);
}

/**
 * Check if a given date is in financial year
 * @param {Date} date - The date to check
 * @param {String} financialYear - FY in format "2526"
 * @param {Number} fyOffset - Offset used in getFinancialYear (default: 500)
 * @returns {Boolean}
 */
function isInFinancialYear(date, financialYear, fyOffset = 500) {
    return getFinancialYear(date, fyOffset) === financialYear;
}

/**
 * Get the start date of a financial year (April 1st)
 * @param {String} financialYear - FY in format "2526"
 * @param {Number} fyOffset - Offset used (default: 500)
 * @returns {Date} Start date of FY (April 1st)
 */
function getFinancialYearStart(financialYear, fyOffset = 500) {
    const fyNum = parseInt(financialYear);
    const year = fyNum - fyOffset;
    return new Date(`April 1, ${year}`);
}

/**
 * Get the end date of a financial year (March 31st)
 * @param {String} financialYear - FY in format "2526"
 * @param {Number} fyOffset - Offset used (default: 500)
 * @returns {Date} End date of FY (March 31st)
 */
function getFinancialYearEnd(financialYear, fyOffset = 500) {
    const fyNum = parseInt(financialYear);
    const year = fyNum - fyOffset + 1;
    return new Date(`March 31, ${year}`);
}

module.exports = {
    getFinancialYear,
    isInFinancialYear,
    getFinancialYearStart,
    getFinancialYearEnd
};
