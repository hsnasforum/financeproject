import fs from "node:fs";
import path from "node:path";
import { IndicatorsStateSchema, parseIndicatorsState } from "./contracts.ts";
import { resolveIndicatorsRoot } from "./store.ts";
import { type IndicatorsState } from "./types.ts";
import {
  storageSchemaCorrupted,
  toStorageReadError,
} from "../planning/storage/serverFileRead.ts";

const EMPTY_STATE: IndicatorsState = {
  lastRunAt: undefined,
  sources: {},
};

export function resolveIndicatorsStatePath(rootDir = resolveIndicatorsRoot()): string {
  return path.join(rootDir, "state.json");
}

export function readIndicatorsState(rootDir = resolveIndicatorsRoot()): IndicatorsState {
  const statePath = resolveIndicatorsStatePath(rootDir);
  if (!fs.existsSync(statePath)) return EMPTY_STATE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(statePath, "utf-8")) as unknown;
  } catch (error) {
    throw toStorageReadError(error, statePath);
  }
  try {
    return parseIndicatorsState(parsed);
  } catch {
    throw storageSchemaCorrupted(statePath, "indicator state schema is invalid");
  }
}

export function writeIndicatorsState(state: IndicatorsState, rootDir = resolveIndicatorsRoot()): void {
  fs.mkdirSync(rootDir, { recursive: true });
  const validated = IndicatorsStateSchema.parse(state);
  fs.writeFileSync(resolveIndicatorsStatePath(rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}
