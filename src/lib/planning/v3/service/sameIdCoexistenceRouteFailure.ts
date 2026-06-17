import { type SameIdCoexistenceRouteLocalSequencingResult } from "./sameIdCoexistenceSequencingTypes";

type SameIdCoexistenceSecondaryFailureSequenceResult = Extract<
  SameIdCoexistenceRouteLocalSequencingResult,
  { status: "secondary-failure" }
>;

export type SameIdCoexistenceUserFacingInternalFailure = {
  code: "INTERNAL";
  message: string;
  successAllowed: false;
};

export function buildSameIdCoexistenceUserFacingInternalFailure(): SameIdCoexistenceUserFacingInternalFailure {
  return {
    code: "INTERNAL",
    message: "배치 계좌 연결에 실패했습니다.",
    successAllowed: false,
  };
}

export function toSameIdCoexistenceUserFacingInternalFailure(
  _input: SameIdCoexistenceSecondaryFailureSequenceResult,
): SameIdCoexistenceUserFacingInternalFailure {
  void _input;
  return buildSameIdCoexistenceUserFacingInternalFailure();
}
