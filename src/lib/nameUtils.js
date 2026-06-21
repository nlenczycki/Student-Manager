// nameUtils.js
//
// JS port of import-scripts/name_utils.py. Kept logically identical so
// names matched by the browser-based importer (ImportView) line up with
// any data previously loaded via the Python scripts — same normalization
// rule, two different runtimes.
//
// This is a stopgap. Name-matching is inherently fragile (two "John
// Smith"s would collide). The moment either system can export a stable
// student ID, switch to matching on ID instead.

const PAREN_PATTERN = /\s*\([^)]*\)/g;

export function stripParenthetical(name) {
  if (typeof name !== 'string') return name;
  return name.replace(PAREN_PATTERN, '').trim();
}

export function normalizeName(name) {
  if (typeof name !== 'string') return '';
  const cleaned = stripParenthetical(name).replace(/\s+/g, ' ').trim();
  return cleaned.toLowerCase();
}

export function displayName(name) {
  if (typeof name !== 'string') return name;
  return stripParenthetical(name).replace(/\s+/g, ' ').trim();
}
