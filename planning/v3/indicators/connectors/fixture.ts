import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ObservationSchema, SeriesSnapshotSchema, type Observation, type SeriesSnapshot, type SeriesSpec } from "../contracts";

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

export async function fetchFixtureSeries(spec: SeriesSpec, asOf = new Date()): Promise<SeriesSnapshot> {
  const fixtureName = fixtureNameFromExternalId(spec.externalId);
  if (!fixtureName) {
    throw new Error(`fixture_external_id_invalid:${spec.externalId}`);
  }

  const filePath = resolveFixturePath(fixtureName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`fixture_not_found:${fixtureName}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { observations?: unknown[] };
  const observations: Observation[] = Array.isArray(parsed.observations)
    ? parsed.observations.map((row) => ObservationSchema.parse(row))
    : [];

  return SeriesSnapshotSchema.parse({
    seriesId: spec.id,
    asOf: asOf.toISOString(),
    observations,
    meta: {
      sourceId: spec.sourceId,
      externalId: spec.externalId,
      frequency: spec.frequency,
      units: spec.units,
      transform: spec.transform,
      notes: spec.notes,
    },
  });
}
