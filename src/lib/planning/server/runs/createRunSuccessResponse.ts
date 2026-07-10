import { buildCreatePlanningRunSuccessMeta } from "./createRunRecordAssembler";
import { type CurrentUserRunRecord } from "./routeService";

type CreatePlanningRunSuccessMetaInput = Parameters<typeof buildCreatePlanningRunSuccessMeta>[0];

export type CreatePlanningRunSuccessResult = {
  ok: true;
  status: number;
  payload: {
    meta: Record<string, unknown>;
    data: CurrentUserRunRecord;
  };
};

export function buildCreatePlanningRunSuccessResult(
  input: CreatePlanningRunSuccessMetaInput & {
    data: CurrentUserRunRecord;
  },
): CreatePlanningRunSuccessResult {
  return {
    ok: true,
    status: 201,
    payload: {
      meta: buildCreatePlanningRunSuccessMeta(input),
      data: input.data,
    },
  };
}
