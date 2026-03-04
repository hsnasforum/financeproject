import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ObservationSchema, type Observation, type SeriesSpec } from "../contracts";
import { ConnectorError } from "./errors";
import type { FetchSeriesOptions, SeriesConnector } from "./types";

const PREFIX = "fixture://";

function fixtureNameFromExternalId(externalId: string): string | null {
  if (!externalId.startsWith(PREFIX)) return null;
  const name = externalId.slice(PREFIX.length).trim();
  return name.length > 0 ? name : null;
}

function resolveFixturePath(name: string): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(thisDir, "..", "fixtures", "series", `${name}.json`);
}

export async function fetchFixtureSeries(spec: SeriesSpec, _options: FetchSeriesOptions): Promise<{
  observations: Observation[];
  meta: {
    sourceId: string;
    externalId: string;
    frequency: SeriesSpec["frequency"];
    units?: string;
    transform?: SeriesSpec["transform"];
    notes?: string;
  };
}> {
  const fixtureName = fixtureNameFromExternalId(spec.externalId);
  if (!fixtureName) {
    throw new ConnectorError("INPUT", `fixture_external_id_invalid:${spec.externalId}`);
  }

  const filePath = resolveFixturePath(fixtureName);
  if (!fs.existsSync(filePath)) {
    throw new ConnectorError("FETCH", `fixture_not_found:${fixtureName}`);
  }

  let parsed: { observations?: unknown[] };
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { observations?: unknown[] };
  } catch (error) {
    throw new ConnectorError("PARSE", error instanceof Error ? error.message : "fixture_json_parse_failed");
  }

  const observations: Observation[] = Array.isArray(parsed.observations)
    ? parsed.observations.map((row) => {
      try {
        return ObservationSchema.parse(row);
      } catch {
        throw new ConnectorError("PARSE", "fixture_observation_parse_failed");
      }
    })
    : [];

  return {
    observations,
    meta: {
      sourceId: spec.sourceId,
      externalId: spec.externalId,
      frequency: spec.frequency,
      units: spec.units,
      transform: spec.transform,
      notes: spec.notes,
    },
  };
}

export const fixtureConnector: SeriesConnector = {
  sourceType: "fixture",
  fetchSeries: fetchFixtureSeries,
};
