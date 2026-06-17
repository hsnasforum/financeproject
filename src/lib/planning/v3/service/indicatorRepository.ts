import { readSeriesObservations as readStoredSeriesObservations } from "../indicators/store";

export type IndicatorSeriesObservations = ReturnType<typeof readStoredSeriesObservations>;

export function readCurrentUserIndicatorSeriesObservations(seriesId: string): IndicatorSeriesObservations {
  return readStoredSeriesObservations(seriesId);
}
