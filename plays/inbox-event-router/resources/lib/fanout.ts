export function normalizeFanOut(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  if (value === null || value === undefined) return [];
  throw new Error("Fan-out result is unavailable");
}
