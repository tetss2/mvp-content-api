function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function round(value, digits = 3) {
  return Number(clamp(value, -999, 999).toFixed(digits));
}

function asText(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

function countMatches(text, patterns) {
  const source = asText(text).toLowerCase();
  return patterns.reduce((count, pattern) => {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, "gi");
    return count + (source.match(regex) || []).length;
  }, 0);
}

function splitParagraphs(text) {
  return asText(text).split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export {
  asText,
  clamp,
  countMatches,
  round,
  splitParagraphs,
  unique,
};
