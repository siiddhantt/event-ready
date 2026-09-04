export function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

export function assertThrows(operation: () => unknown, includes: string): void {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error && error.message.includes(includes)) return;
    throw error;
  }
  throw new Error(`Expected error containing: ${includes}`);
}
