export type UrlWizardResult = {
  baseUrl?: string;
  sanitizedPreview: string;
  warnings: string[];
  error?: string;
};

function isSensitiveParamName(name: string): boolean {
  const key = name.toLowerCase();
  return key.includes("key") || key.includes("token") || key.includes("auth");
}

export function extractBaseUrlFromSample(input: string): UrlWizardResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { sanitizedPreview: "", warnings: [], error: "샘플 URL을 입력하세요." };
  }

  let candidate = trimmed;
  const warnings: string[] = [];
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(candidate) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(candidate)) {
      candidate = `https://${candidate}`;
      warnings.push("스킴이 없어 https://를 자동으로 보정했습니다.");
    }
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { sanitizedPreview: "", warnings: [], error: "유효한 URL이 아닙니다. http(s):// 형식을 확인하세요." };
  }

  if (url.searchParams.size > 0) {
    warnings.push("쿼리 문자열이 포함되어 base URL에서 제거됩니다.");
  }

  for (const key of url.searchParams.keys()) {
    if (isSensitiveParamName(key)) {
      warnings.push("키/토큰성 파라미터가 포함되어 값은 자동으로 마스킹되었습니다.");
      url.searchParams.set(key, "<REDACTED>");
    }
  }

  const sanitizedPreview = url.toString();
  const baseUrl = `${url.origin}${url.pathname}`;
  return { baseUrl, sanitizedPreview, warnings };
}
