export const BENEFIT_TOPICS = {
  housing: {
    label: "주거",
    synonyms: ["주거", "주택", "주택개선", "임대", "보증금", "거주", "전입"],
    fields: ["title", "summary", "eligibility", "applyHow", "org"],
  },
  youth: {
    label: "청년",
    synonyms: ["청년", "청년층", "청년내일", "청년도약", "청년희망"],
    fields: ["title", "summary", "eligibility", "applyHow", "org"],
  },
  birth: {
    label: "출산",
    synonyms: ["출산", "임신", "난임", "산모", "신생아", "육아", "양육"],
    fields: ["title", "summary", "eligibility", "applyHow", "org"],
  },
  job: {
    label: "취업",
    synonyms: ["취업", "일자리", "채용", "구직", "실업", "직업훈련", "인턴"],
    fields: ["title", "summary", "eligibility", "applyHow", "org"],
  },
  education: {
    label: "교육",
    synonyms: ["교육", "학자금", "장학", "등록금", "수강", "학교", "대학"],
    fields: ["title", "summary", "eligibility", "applyHow", "org"],
  },
  medical: {
    label: "의료",
    synonyms: ["의료", "건강", "치료", "진료", "검진", "수술", "병원", "약제"],
    fields: ["title", "summary", "eligibility", "applyHow", "org"],
  },
  jeonse: {
    label: "전세",
    synonyms: ["전세", "전세자금", "전세보증", "전세대출", "임차보증금"],
    fields: ["title", "summary", "eligibility", "applyHow", "org"],
  },
  wolse: {
    label: "월세",
    synonyms: ["월세", "월세지원", "임대료", "주거급여", "렌트"],
    fields: ["title", "summary", "eligibility", "applyHow", "org"],
  },
} as const;

export type BenefitTopicKey = keyof typeof BENEFIT_TOPICS;

export const BENEFIT_TOPIC_KEYS = Object.keys(BENEFIT_TOPICS) as BenefitTopicKey[];
export const BENEFIT_ALL_TOPICS_COUNT = BENEFIT_TOPIC_KEYS.length;

export function isTopicFilterBypassed(selectedTopics: BenefitTopicKey[]): boolean {
  return selectedTopics.length === 0 || selectedTopics.length === BENEFIT_ALL_TOPICS_COUNT;
}

export function parseTopicKeys(value: string[] | null | undefined): BenefitTopicKey[] {
  if (!value || value.length === 0) return [];
  const set = new Set(value.map((entry) => entry.trim()).filter(Boolean));
  return BENEFIT_TOPIC_KEYS.filter((key) => set.has(key));
}
