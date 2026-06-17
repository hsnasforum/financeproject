import {
  readDailyStatsLastNDays as readStoredDailyStatsLastNDays,
  readState as readStoredNewsState,
  readTodayCache as readStoredTodayCache,
  readTrendsCache as readStoredTrendsCache,
} from "../news/store";

export type NewsRuntimeStateRecord = ReturnType<typeof readStoredNewsState>;
export type NewsTodayCacheRecord = ReturnType<typeof readStoredTodayCache>;
export type NewsTrendsCacheRecord = ReturnType<typeof readStoredTrendsCache>;
export type NewsDailyStatsInput = Parameters<typeof readStoredDailyStatsLastNDays>[0];
export type NewsDailyStatsRows = ReturnType<typeof readStoredDailyStatsLastNDays>;

export function readCurrentUserNewsState(): NewsRuntimeStateRecord {
  return readStoredNewsState();
}

export function readCurrentUserTodayNewsCache(): NewsTodayCacheRecord {
  return readStoredTodayCache();
}

export function readCurrentUserNewsTrendsCache(windowDays: 7 | 30): NewsTrendsCacheRecord {
  return readStoredTrendsCache(windowDays);
}

export function readCurrentUserNewsDailyStatsLastNDays(input: NewsDailyStatsInput): NewsDailyStatsRows {
  return readStoredDailyStatsLastNDays(input);
}
