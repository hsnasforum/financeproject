import { z } from "zod";

export const DAILY_ROUTINE_ITEM_DEFS = [
  { id: "refresh_news", label: "뉴스 수동 갱신 실행 확인" },
  { id: "check_burst_topics", label: "급증 토픽 상/중/하 확인" },
  { id: "review_scenarios", label: "Base/Bull/Bear 시나리오 확인" },
  { id: "check_watchlist_unknowns", label: "체크 변수 unknown 원인 확인" },
  { id: "write_journal", label: "오늘 저널 관찰/가정/옵션 기록" },
] as const;

export const RoutineItemIdSchema = z.enum(DAILY_ROUTINE_ITEM_DEFS.map((row) => row.id) as [string, ...string[]]);
export type RoutineItemId = z.infer<typeof RoutineItemIdSchema>;

export const DailyRoutineChecklistItemSchema = z.object({
  id: RoutineItemIdSchema,
  label: z.string().trim().min(1),
  checked: z.boolean(),
}).strict();

export const DailyRoutineChecklistSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(DailyRoutineChecklistItemSchema).length(DAILY_ROUTINE_ITEM_DEFS.length),
  savedAt: z.string().datetime().nullable().optional(),
}).strict();

export const DailyRoutineChecklistInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(z.object({
    id: RoutineItemIdSchema,
    checked: z.boolean(),
  }).strict()).optional(),
}).strict();

export type DailyRoutineChecklist = z.infer<typeof DailyRoutineChecklistSchema>;
export type DailyRoutineChecklistInput = z.infer<typeof DailyRoutineChecklistInputSchema>;

export function buildDefaultDailyRoutineChecklist(date: string): DailyRoutineChecklist {
  const safeDate = DailyRoutineChecklistInputSchema.shape.date.parse(date);
  return DailyRoutineChecklistSchema.parse({
    schemaVersion: 1,
    date: safeDate,
    items: DAILY_ROUTINE_ITEM_DEFS.map((row) => ({
      id: row.id,
      label: row.label,
      checked: false,
    })),
    savedAt: null,
  });
}

export function normalizeDailyRoutineChecklistInput(input: unknown): DailyRoutineChecklistInput {
  const parsed = DailyRoutineChecklistInputSchema.parse(input);
  const checkedById = new Map<RoutineItemId, boolean>();
  for (const row of parsed.items ?? []) {
    checkedById.set(row.id, row.checked);
  }

  return DailyRoutineChecklistInputSchema.parse({
    date: parsed.date,
    items: DAILY_ROUTINE_ITEM_DEFS.map((row) => ({
      id: row.id,
      checked: checkedById.get(row.id) ?? false,
    })),
  });
}
