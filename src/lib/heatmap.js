/**
 * Department accent colors as RGB channels for use in rgba() heatmap backgrounds.
 * Each department gets a distinct color. Sales = orange (Clay-style).
 */
export const DEPARTMENT_COLORS = {
  Sales:       { r: 242, g: 153, b: 74 },  // #F2994A orange
  Operations:  { r: 39,  g: 174, b: 96 },  // #27AE60 green
  Finance:     { r: 47,  g: 128, b: 237 }, // #2F80ED blue
  HR:          { r: 235, g: 87,  b: 87 },   // #EB5757 red
  Purchasing:  { r: 155, g: 89,  b: 182 }, // #9B59B6 purple
  Accounting:  { r: 52,  g: 152, b: 219 }, // #3498DB light blue
};

/**
 * Compute min and max for an array of numeric values (nulls/NaN ignored).
 */
export function columnRange(values) {
  const nums = (values || []).filter(v => v != null && !isNaN(v));
  if (nums.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/**
 * Compute min/max for multiple fields across an array of records.
 *
 * @param {array} records - The visible rows (e.g. paginated items)
 * @param {object} fieldGetters - { fieldName: (record) => number }
 * @returns {object} { fieldName: { min, max }, ... }
 */
export function computeColumnRanges(records, fieldGetters) {
  const result = {};
  for (const [key, getter] of Object.entries(fieldGetters)) {
    const values = (records || []).map(r => {
      const n = Number(getter(r));
      return isNaN(n) ? null : n;
    });
    result[key] = columnRange(values);
  }
  return result;
}

/**
 * Returns a React style object with a heatmap background color.
 * Opacity is proportional to the value's position between min and max:
 *   - Highest value  → most intense (maxOpacity)
 *   - Lowest value   → nearly transparent (0.03)
 *   - Middle values  → proportional gradient
 *
 * Text stays black/legible — only the cell background is tinted.
 *
 * @param {number} value - The cell value
 * @param {number} min - Column minimum
 * @param {number} max - Column maximum
 * @param {{r,g,b}} color - RGB color object (from DEPARTMENT_COLORS)
 * @param {number} maxOpacity - Max opacity for the strongest cell (default 0.22)
 * @returns {object} React style object (empty if value is null or min===max)
 */
export function heatmapStyle(value, min, max, color, maxOpacity = 0.22) {
  if (value == null || isNaN(value) || min === max) return {};
  const ratio = max > min ? (value - min) / (max - min) : 0.5;
  const opacity = Math.max(0.03, ratio * maxOpacity);
  return {
    backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`,
  };
}

/**
 * Returns a React style object with a soft diagonal gradient background
 * using the department accent color. Creates a "tinted glass" effect
 * across the entire table surface (Clay-style design).
 *
 * @param {{r,g,b}} color - RGB color object (from DEPARTMENT_COLORS)
 * @param {number} intensity - Max opacity for the gradient midpoint (default 0.08)
 * @returns {object} React style object
 */
export function tableGradientStyle(color, intensity = 0.08) {
  const { r, g, b } = color;
  return {
    background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, ${intensity * 0.3}) 0%, rgba(${r}, ${g}, ${b}, ${intensity}) 45%, rgba(${r}, ${g}, ${b}, ${intensity * 0.5}) 100%)`,
  };
}