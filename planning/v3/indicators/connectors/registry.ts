import type { IndicatorSource } from "../contracts";
import { ConnectorError } from "./errors";
import { ecosConnector } from "./ecos";
import { fredConnector } from "./fred";
import { fixtureConnector } from "./fixture";
import type { SeriesConnector } from "./types";

const CONNECTOR_BY_SOURCE_TYPE: Partial<Record<IndicatorSource["type"], SeriesConnector>> = {
  fixture: fixtureConnector,
  ecos: ecosConnector,
  fred: fredConnector,
};

export function getConnector(source: IndicatorSource): SeriesConnector {
  const connector = CONNECTOR_BY_SOURCE_TYPE[source.type];
  if (!connector) {
    throw new ConnectorError("INPUT", `connector_not_configured:${source.type}`);
  }
  return connector;
}
