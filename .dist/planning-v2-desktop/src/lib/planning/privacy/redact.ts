const BEARER_PATTERN = /\b(Bearer\s+)[^\s"'`]+/gi;
const ENV_SECRET_PATTERN = /\b(BOK_ECOS_API_KEY|ECOS_API_KEY|GITHUB_TOKEN(?:_[A-Z0-9_]+)?|FINLIFE_[A-Z0-9_]*(?:KEY|TOKEN))\s*=\s*[^\s"'`]+/gi;
const JSON_SECRET_PATTERN = /(["']?(?:BOK_ECOS_API_KEY|ECOS_API_KEY|GITHUB_TOKEN(?:_[A-Z0-9_]+)?|FINLIFE_[A-Z0-9_]*(?:KEY|TOKEN)|authorization|token|api[_-]?key|secret|password)["']?\s*[:=]\s*["'])([^"']+)(["'])/gi;
const DATA_PATH_PATTERN = /\.data(?:[\\/][^\s"'`)\]}]+)+/g;
const LARGE_AMOUNT_PATTERN = /\b\d{7,}\b/g;

export function redactText(s: string): string {
  if (typeof s !== "string" || s.length < 1) return "";
  return s
    .replace(BEARER_PATTERN, "$1***")
    .replace(ENV_SECRET_PATTERN, "$1=***")
    .replace(JSON_SECRET_PATTERN, "$1***$3")
    .replace(DATA_PATH_PATTERN, "<DATA_PATH>")
    .replace(LARGE_AMOUNT_PATTERN, "<AMOUNT>");
}
