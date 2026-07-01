import type { IndicatorSourceType, Observation, SeriesSnapshotMeta, SeriesSpec } from "../contracts";

export type FetchSeriesOptions = {
  asOf: Date;
  attempt: number;
  maxAttempts: number;
};

export type ConnectorSeriesResult = {
  observations: Observation[];
  meta: SeriesSnapshotMeta;
};

export type SeriesConnector = {
  sourceType: IndicatorSourceType;
  fetchSeries: (spec: SeriesSpec, options: FetchSeriesOptions) => Promise<ConnectorSeriesResult>;
};
