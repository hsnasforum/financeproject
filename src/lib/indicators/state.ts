import fs from "node:fs";
import path from "node:path";
import { IndicatorsStateSchema, parseIndicatorsState } from "./contracts";
import { resolveIndicatorsRoot } from "./store";
import { type IndicatorsState } from "./types";

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
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8")) as unknown;
    return parseIndicatorsState(parsed);
  } catch {
    return EMPTY_STATE;
  }
}

export function writeIndicatorsState(state: IndicatorsState, rootDir = resolveIndicatorsRoot()): void {
  fs.mkdirSync(rootDir, { recursive: true });
  const validated = IndicatorsStateSchema.parse(state);
  fs.writeFileSync(resolveIndicatorsStatePath(rootDir), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
}
