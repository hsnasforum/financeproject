export type IndicatorSourceType = "ecos" | "kosis" | "fred";

export type IndicatorTransform = "none" | "pct_change" | "diff" | "log";

export type IndicatorSource = {
  id: string;
  name: string;
  type: IndicatorSourceType;
  enabled: boolean;
};

export type IndicatorSourcesFile = {
  version: number;
  generatedAt?: string;
  sources: IndicatorSource[];
};

export type SeriesSpec = {
  id: string;
  sourceId: string;
  externalId: string;
  name: string;
  frequency: "D" | "W" | "M" | "Q" | "A";
  units?: string;
  transform?: IndicatorTransform;
  notes?: string;
};

export type IndicatorSeriesFile = {
  version: number;
  generatedAt?: string;
  series: SeriesSpec[];
};

export type Observation = {
  date: string;
  value: number;
};

export type SeriesSnapshot = {
  seriesId: string;
  asOf: string;
  observations: Observation[];
  meta: {
    sourceId: string;
    externalId: string;
    frequency: SeriesSpec["frequency"];
    units?: string;
    transform: IndicatorTransform;
    lastUpdatedAt: string;
    observationCount: number;
  };
};

export type SourceRuntimeState = {
  etag?: string;
  lastModified?: string;
  lastRunAt?: string;
  cursor?: string;
};

export type IndicatorsState = {
  lastRunAt?: string;
  sources: Record<string, SourceRuntimeState>;
};

export type IndicatorsRefreshError = {
  sourceId: string;
  seriesId?: string;
  code: string;
  message: string;
};

export type IndicatorsRefreshResult = {
  generatedAt: string;
  sourcesProcessed: number;
  seriesProcessed: number;
  seriesUpdated: number;
  observationsAppended: number;
  errors: IndicatorsRefreshError[];
};

export type ConnectorFetchResult = {
  asOf: string;
  observations: Observation[];
  etag?: string;
  lastModified?: string;
  cursor?: string;
  meta?: Record<string, string | number | boolean | null>;
};

export type ConnectorFetchInput = {
  source: IndicatorSource;
  spec: SeriesSpec;
  previousState: SourceRuntimeState | undefined;
  now: Date;
  fetchImpl?: typeof fetch;
};

export type IndicatorConnector = {
  fetchSeries: (input: ConnectorFetchInput) => Promise<ConnectorFetchResult>;
};
