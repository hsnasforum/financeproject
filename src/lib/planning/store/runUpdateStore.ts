import {
  toRunIndexEntry,
  type RunIndexEntry,
} from "./runIndex";
import { toMetaRecord } from "./runMetaRecord";
import {
  writeRunMetaRecord,
  type WrittenRunMetaRecord,
} from "./runMetaWriter";
import { type PlanningRunRecord } from "./types";

type UpdateRunPatchBase = Partial<Pick<
  PlanningRunRecord,
  "title" | "scenario" | "overallStatus" | "stages" | "input" | "meta" | "outputs" | "reproducibility"
>>;

export type UpdateRunPatch = UpdateRunPatchBase & {
  actionCenter?: PlanningRunRecord["actionCenter"] | null;
};

type GetRun = (id: string) => Promise<PlanningRunRecord | null>;
type NormalizeRunRecord = (record: PlanningRunRecord) => PlanningRunRecord;
type ToIndexEntry = (record: PlanningRunRecord) => RunIndexEntry;
type WriteMetaRecord = (record: PlanningRunRecord) => Promise<WrittenRunMetaRecord>;
type UpsertIndexEntry = (entry: RunIndexEntry) => Promise<void>;

export type RunUpdateStore = {
  updateRun: (id: string, patch: UpdateRunPatch) => Promise<PlanningRunRecord | null>;
};

export type RunUpdateStoreDependencies = {
  getRun: GetRun;
  normalizeRecord?: NormalizeRunRecord;
  toIndexEntry?: ToIndexEntry;
  upsertIndexEntry: UpsertIndexEntry;
  writeMetaRecord?: WriteMetaRecord;
};

function mergeRunPatch(current: PlanningRunRecord, patch: UpdateRunPatch): PlanningRunRecord {
  const next: PlanningRunRecord = {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.scenario !== undefined ? { scenario: patch.scenario } : {}),
    ...(patch.overallStatus !== undefined ? { overallStatus: patch.overallStatus } : {}),
    ...(patch.stages !== undefined ? { stages: patch.stages } : {}),
    ...(patch.input ? { input: { ...current.input, ...patch.input } } : {}),
    ...(patch.meta ? { meta: { ...current.meta, ...patch.meta } } : {}),
    ...(patch.outputs ? { outputs: { ...current.outputs, ...patch.outputs } } : {}),
    ...(patch.reproducibility !== undefined ? { reproducibility: patch.reproducibility } : {}),
  };
  if (patch.actionCenter === null) {
    delete next.actionCenter;
  } else if (patch.actionCenter !== undefined) {
    next.actionCenter = patch.actionCenter;
  }
  return next;
}

export function createRunUpdateStore(dependencies: RunUpdateStoreDependencies): RunUpdateStore {
  const normalizeRecord = dependencies.normalizeRecord ?? toMetaRecord;
  const toIndexEntry = dependencies.toIndexEntry ?? toRunIndexEntry;
  const writeMetaRecord = dependencies.writeMetaRecord ?? writeRunMetaRecord;

  return {
    async updateRun(id, patch) {
      const current = await dependencies.getRun(id);
      if (!current) return null;

      const next = normalizeRecord({
        ...mergeRunPatch(current, patch),
        id: current.id,
        profileId: current.profileId,
        createdAt: current.createdAt,
        version: 1,
      });
      await writeMetaRecord(next);
      await dependencies.upsertIndexEntry(toIndexEntry(next));
      return next;
    },
  };
}
