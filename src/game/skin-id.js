// Only this public cosmetic identifier travels with the roster. Clients own
// the class-specific mapping from an ID to local illustrated sheets.
export function isSkinId(value) {
  return typeof value === 'string' && value.length <= 40 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}
