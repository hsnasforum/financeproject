import { type FinlifeKind } from "@/lib/finlife/types";

export type FinlifeFieldSpec = {
  label: string;
  keys: string[];
  maxLen?: number;
  help?: string;
};

export type FinlifeFieldConfig = {
  productFields?: FinlifeFieldSpec[];
  optionFields?: FinlifeFieldSpec[];
};

export const FINLIFE_FIELD_CONFIG: Partial<Record<FinlifeKind, FinlifeFieldConfig>> = {
  pension: {
    productFields: [
      { label: "가입방법", keys: ["join_way", "join_way_dtl"], help: "가입 가능한 채널 안내입니다." },
      { label: "가입대상", keys: ["join_member", "join_member_desc"], help: "누가 가입할 수 있는지 설명합니다." },
      { label: "우대조건", keys: ["spcl_cnd"], help: "추가 혜택을 받기 위한 조건입니다." },
    ],
    optionFields: [
      { label: "기간", keys: ["save_trm"] },
      { label: "이자 방식", keys: ["intr_rate_type_nm"] },
      { label: "기본금리(연)", keys: ["intr_rate"] },
      { label: "최고금리(연, 우대포함)", keys: ["intr_rate2"] },
    ],
  },
  deposit: {
    productFields: [
      { label: "가입방법", keys: ["join_way"], help: "영업점/비대면 등 가입 채널입니다." },
      { label: "가입대상", keys: ["join_member"], help: "가입 가능한 대상입니다." },
      { label: "유의사항", keys: ["etc_note"], help: "중도해지, 예치기간 등 확인 사항입니다." },
    ],
    optionFields: [
      { label: "기간", keys: ["save_trm"] },
      { label: "이자 방식", keys: ["intr_rate_type_nm"] },
      { label: "기본금리(연)", keys: ["intr_rate"] },
      { label: "최고금리(연, 우대포함)", keys: ["intr_rate2"] },
    ],
  },
  saving: {
    productFields: [
      { label: "가입방법", keys: ["join_way"], help: "영업점/비대면 등 가입 채널입니다." },
      { label: "가입대상", keys: ["join_member"], help: "가입 가능한 대상입니다." },
      { label: "우대조건", keys: ["spcl_cnd"], help: "우대금리 적용 조건입니다." },
    ],
    optionFields: [
      { label: "기간", keys: ["save_trm"] },
      { label: "이자 방식", keys: ["intr_rate_type_nm"] },
      { label: "기본금리(연)", keys: ["intr_rate"] },
      { label: "최고금리(연, 우대포함)", keys: ["intr_rate2"] },
    ],
  },
  "mortgage-loan": {
    optionFields: [
      { label: "금리유형", keys: ["lend_rate_type_nm", "intr_rate_type_nm"], help: "고정/변동 등 금리 적용 방식입니다." },
      { label: "상환방식", keys: ["rpym_type_nm", "rpym_way"], help: "원리금균등/만기일시상환 등 상환 구조입니다." },
      { label: "최저금리(연)", keys: ["lend_rate_min"], help: "심사/조건별 최저 적용 금리입니다." },
      { label: "최고금리(연)", keys: ["lend_rate_max"], help: "심사/조건별 최고 적용 금리입니다." },
      { label: "대출한도", keys: ["loan_lmt", "loan_limit"], help: "심사 결과에 따라 가능한 최대 한도입니다." },
    ],
  },
  "rent-house-loan": {
    optionFields: [
      { label: "금리유형", keys: ["lend_rate_type_nm", "intr_rate_type_nm"], help: "고정/변동 등 금리 적용 방식입니다." },
      { label: "상환방식", keys: ["rpym_type_nm", "rpym_way"], help: "원리금균등/만기일시상환 등 상환 구조입니다." },
      { label: "최저금리(연)", keys: ["lend_rate_min"], help: "심사/조건별 최저 적용 금리입니다." },
      { label: "최고금리(연)", keys: ["lend_rate_max"], help: "심사/조건별 최고 적용 금리입니다." },
      { label: "대출한도", keys: ["loan_lmt", "loan_limit"], help: "심사 결과에 따라 가능한 최대 한도입니다." },
    ],
  },
  "credit-loan": {
    optionFields: [
      { label: "금리유형", keys: ["crdt_lend_rate_type_nm", "intr_rate_type_nm"], help: "고정/변동 등 금리 적용 방식입니다." },
      { label: "상환방식", keys: ["crdt_rpym_type_nm", "rpym_type_nm"], help: "원리금균등/만기일시상환 등 상환 구조입니다." },
      { label: "평균금리(연)", keys: ["crdt_grad_avg"], help: "신용등급/조건 구간 평균 금리입니다." },
      { label: "대출한도", keys: ["crdt_lend_lmt", "loan_lmt"], help: "심사 결과에 따라 가능한 최대 한도입니다." },
    ],
  },
};
