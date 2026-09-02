export function buildConfirmString(action: string, id: string): string {
  const normalizedAction = action.trim().replace(/\s+/g, " ");
  const normalizedId = id.trim();
  return `${normalizedAction} ${normalizedId}`.trim();
}

export function verifyConfirm(input: string, expected: string): boolean {
  return input.trim() === expected.trim();
}

export type ManualConfirmInput = {
  expectedConfirm: string;
  confirmText: string;
};

export function createManualConfirmInput(action: string, id: string): ManualConfirmInput {
  return {
    expectedConfirm: buildConfirmString(action, id),
    confirmText: "",
  };
}
