export function buildConfirmString(action: string, id: string): string {
  const normalizedAction = action.trim().replace(/\s+/g, " ");
  const normalizedId = id.trim();
  return `${normalizedAction} ${normalizedId}`.trim();
}

export function verifyConfirm(input: string, expected: string): boolean {
  return input.trim() === expected.trim();
}
