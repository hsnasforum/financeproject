export type ValidationBag = {
  issues: string[];
};

export function createValidationBag(): ValidationBag {
  return { issues: [] };
}

export function addIssue(bag: ValidationBag, path: string, message: string): void {
  bag.issues.push(`${path} ${message}`);
}

export function hasIssues(bag: ValidationBag): boolean {
  return bag.issues.length > 0;
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseEnum<T extends readonly string[]>(
  bag: ValidationBag,
  input: {
    path: string;
    value: unknown;
    allowed: T;
    fallback: T[number];
    required?: boolean;
  },
): T[number] {
  const isMissing = input.value === undefined || input.value === null || input.value === "";
  if (isMissing) {
    if (input.required) addIssue(bag, input.path, "is required");
    return input.fallback;
  }
  if (typeof input.value !== "string") {
    addIssue(bag, input.path, `must be one of ${input.allowed.join("|")}`);
    return input.fallback;
  }
  if (!input.allowed.includes(input.value as T[number])) {
    addIssue(bag, input.path, `must be one of ${input.allowed.join("|")}`);
    return input.fallback;
  }
  return input.value as T[number];
}

export function parseIntValue(
  bag: ValidationBag,
  input: {
    path: string;
    value: unknown;
    fallback: number;
    min?: number;
    max?: number;
    required?: boolean;
    clamp?: boolean;
  },
): number {
  const isMissing = input.value === undefined || input.value === null || input.value === "";
  if (isMissing) {
    if (input.required) addIssue(bag, input.path, "is required");
    return input.fallback;
  }

  const parsed = parseNumeric(input.value);
  if (parsed === null || !Number.isInteger(parsed)) {
    addIssue(bag, input.path, "must be an integer");
    return input.fallback;
  }

  const min = input.min ?? Number.MIN_SAFE_INTEGER;
  const max = input.max ?? Number.MAX_SAFE_INTEGER;
  if (parsed < min || parsed > max) {
    if (input.clamp) {
      return Math.max(min, Math.min(max, parsed));
    }
    addIssue(bag, input.path, `must be between ${min} and ${max}`);
    return input.fallback;
  }

  return parsed;
}

export function parseNumberValue(
  bag: ValidationBag,
  input: {
    path: string;
    value: unknown;
    fallback: number;
    min?: number;
    max?: number;
    required?: boolean;
    clamp?: boolean;
  },
): number {
  const isMissing = input.value === undefined || input.value === null || input.value === "";
  if (isMissing) {
    if (input.required) addIssue(bag, input.path, "is required");
    return input.fallback;
  }

  const parsed = parseNumeric(input.value);
  if (parsed === null) {
    addIssue(bag, input.path, "must be numeric");
    return input.fallback;
  }

  const min = input.min ?? Number.NEGATIVE_INFINITY;
  const max = input.max ?? Number.POSITIVE_INFINITY;
  if (parsed < min || parsed > max) {
    if (input.clamp) {
      return Math.max(min, Math.min(max, parsed));
    }
    addIssue(bag, input.path, `must be between ${min} and ${max}`);
    return input.fallback;
  }

  return parsed;
}

export function parseStringValue(
  bag: ValidationBag,
  input: {
    path: string;
    value: unknown;
    fallback: string;
    required?: boolean;
    trim?: boolean;
    minLength?: number;
    maxLength?: number;
  },
): string {
  const isMissing = input.value === undefined || input.value === null;
  if (isMissing) {
    if (input.required) addIssue(bag, input.path, "is required");
    return input.fallback;
  }
  if (typeof input.value !== "string") {
    addIssue(bag, input.path, "must be a string");
    return input.fallback;
  }

  const trim = input.trim ?? true;
  const value = trim ? input.value.trim() : input.value;
  if (input.required && value.length === 0) {
    addIssue(bag, input.path, "must not be empty");
    return input.fallback;
  }
  if (input.minLength !== undefined && value.length < input.minLength) {
    addIssue(bag, input.path, `must be at least ${input.minLength} characters`);
    return input.fallback;
  }
  if (input.maxLength !== undefined && value.length > input.maxLength) {
    addIssue(bag, input.path, `must be at most ${input.maxLength} characters`);
    return input.fallback;
  }
  return value;
}

export function parseArrayValue<T>(
  bag: ValidationBag,
  input: {
    path: string;
    value: unknown;
    fallback: T[];
    required?: boolean;
  },
): T[] {
  const isMissing = input.value === undefined || input.value === null;
  if (isMissing) {
    if (input.required) addIssue(bag, input.path, "is required");
    return input.fallback;
  }
  if (!Array.isArray(input.value)) {
    addIssue(bag, input.path, "must be an array");
    return input.fallback;
  }
  return input.value as T[];
}
