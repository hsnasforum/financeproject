function stripTags(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\u00a0/g, " ");
}

function normalizeText(html: string): string {
  return decodeEntities(stripTags(html)).replace(/\s+/g, " ").trim();
}

function firstNumber(regex: RegExp, text: string): number | null {
  const match = text.match(regex);
  if (!match?.[1]) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function parseBokMpcBaseRate(html: string): number | null {
  const text = normalizeText(html);

  const direct = firstNumber(/Base\s+Rate(?:\s+\w+){0,8}\s+at\s+([0-9]+(?:\.[0-9]+)?)\s*%/i, text);
  if (direct !== null) return direct;

  return firstNumber(/Base\s+Rate\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*%/i, text);
}

export function parseBokInterestRates(html: string): {
  newDepositAvgPct?: number;
  newLoanAvgPct?: number;
  depositOutstandingAvgPct?: number;
  loanOutstandingAvgPct?: number;
} {
  const text = normalizeText(html);

  const newDepositAvgPct = firstNumber(/average\s+interest\s+rate\s+on\s+new\s+deposits\s+was\s+([0-9]+(?:\.[0-9]+)?)\s*%/i, text);
  const newLoanAvgPct = firstNumber(/average\s+interest\s+rate\s+on\s+new\s+loans\s+was\s+([0-9]+(?:\.[0-9]+)?)\s*%/i, text);
  const depositOutstandingAvgPct = firstNumber(
    /(?:average\s+interest\s+rate\s+on|that\s+on)\s+outstanding\s+deposits\s+was\s+([0-9]+(?:\.[0-9]+)?)\s*%/i,
    text,
  );
  const loanOutstandingAvgPct = firstNumber(
    /(?:average\s+interest\s+rate\s+on|that\s+on)\s+outstanding\s+loans\s+was\s+([0-9]+(?:\.[0-9]+)?)\s*%/i,
    text,
  );

  return {
    ...(newDepositAvgPct !== null ? { newDepositAvgPct } : {}),
    ...(newLoanAvgPct !== null ? { newLoanAvgPct } : {}),
    ...(depositOutstandingAvgPct !== null ? { depositOutstandingAvgPct } : {}),
    ...(loanOutstandingAvgPct !== null ? { loanOutstandingAvgPct } : {}),
  };
}

export function parseCpi(html: string): {
  cpiYoYPct?: number;
  coreCpiYoYPct?: number;
} {
  const text = normalizeText(html);

  const cpiYoYPct = firstNumber(
    /rose\s+([0-9]+(?:\.[0-9]+)?)\s+percent\s+from\s+the\s+same\s+month\s+of\s+the\s+previous\s+year/i,
    text,
  );

  const coreCpiYoYPct = firstNumber(
    /excluding\s+food\s+and\s+energy[\s\S]{0,180}?rose\s+([0-9]+(?:\.[0-9]+)?)\s+percent/i,
    text,
  );

  return {
    ...(cpiYoYPct !== null ? { cpiYoYPct } : {}),
    ...(coreCpiYoYPct !== null ? { coreCpiYoYPct } : {}),
  };
}
