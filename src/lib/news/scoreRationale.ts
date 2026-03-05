import { type BurstLevel, type NewsScoreParts } from "./types.ts";

type ScoreRationaleInput = {
  scoreParts?: Partial<NewsScoreParts> | null;
  burstLevel?: BurstLevel;
};

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildScoreRationale(input: ScoreRationaleInput): string {
  const parts = input.scoreParts ?? {};
  const lines: string[] = [];

  const source = asNumber(parts.source, 0);
  const recency = asNumber(parts.recency, 0);
  const keyword = asNumber(parts.keyword, 0);
  const burst = asNumber(parts.burst, 0);
  const diversityPenalty = asNumber(parts.diversityPenalty, 0);
  const duplicatePenalty = asNumber(parts.duplicatePenalty, 0);

  if (burst > 0 || input.burstLevel === "상" || input.burstLevel === "중") {
    lines.push("급증 토픽 반영");
  }
  if (recency > 0) {
    lines.push("최근성 반영");
  }
  if (source > 0) {
    lines.push("소스 신뢰도 반영");
  }
  if (keyword > 0) {
    lines.push("키워드 일치 반영");
  }
  if (diversityPenalty > 0) {
    lines.push("소스 편중 감점");
  }
  if (duplicatePenalty > 0) {
    lines.push("중복 신호 감점");
  }

  if (lines.length < 1) {
    return "기본 점수 규칙 반영";
  }
  return lines.slice(0, 3).join(" + ");
}
