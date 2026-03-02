export type Gov24TargetType = "individual" | "smallbiz" | "corp";
export type Gov24Gender = "M" | "F";
export type Gov24IncomeBracket = "0_50" | "51_75" | "76_100" | "101_200" | "200_plus";

export type Gov24SimpleFindInput = {
  targetType: Gov24TargetType;
  region: {
    sido: string;
    sigungu: string;
  };
  birth: {
    yyyymmdd: string;
    gender: Gov24Gender;
  };
  incomeBracket: Gov24IncomeBracket;
  personalTraits: string[];
  householdTraits: string[];
  q?: string;
};

export const GOV24_PERSONAL_TRAITS = [
  "해당사항 없음",
  "장애인",
  "국가유공자",
  "구직자/실업자",
  "임산부",
  "청년",
  "고령자",
  "기초생활수급자",
  "차상위계층",
  "한부모가정",
] as const;

export const GOV24_HOUSEHOLD_TRAITS = [
  "해당사항 없음",
  "다문화가정",
  "한부모가정",
  "다자녀가구",
  "무주택세대",
  "신혼부부",
  "조손가정",
  "장애인가구",
  "저소득가구",
  "청년가구",
] as const;

