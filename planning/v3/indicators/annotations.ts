import { z } from "zod";
import { normalizeSeriesId } from "./aliases";
import { SeriesSpecSchema, type SeriesSpec } from "./contracts";

export const IndicatorCategorySchema = z.enum([
  "rates",
  "inflation",
  "fx",
  "growth",
  "labor",
  "credit",
  "commodities",
  "fiscal",
  "liquidity",
  "general",
]);
export type IndicatorCategory = z.infer<typeof IndicatorCategorySchema>;

export const IndicatorAnnotationSchema = z.object({
  seriesId: z.string().trim().min(1),
  category: IndicatorCategorySchema,
  label: z.string().trim().min(1),
});
export type IndicatorAnnotation = z.infer<typeof IndicatorAnnotationSchema>;

export const IndicatorCatalogRowSchema = SeriesSpecSchema.extend({
  annotation: IndicatorAnnotationSchema,
  displayLabel: z.string().trim().min(1),
});
export type IndicatorCatalogRow = z.infer<typeof IndicatorCatalogRowSchema>;

const RAW_ANNOTATIONS: IndicatorAnnotation[] = [
  { seriesId: "kr_base_rate", category: "rates", label: "기준금리" },
  { seriesId: "kr_gov_bond_3y", category: "rates", label: "국고채 3년" },
  { seriesId: "kr_cpi", category: "inflation", label: "소비자물가(CPI)" },
  { seriesId: "kr_core_cpi", category: "inflation", label: "근원물가" },
  { seriesId: "kr_usdkrw", category: "fx", label: "USDKRW" },
  { seriesId: "kr_cab", category: "fx", label: "경상수지" },
  { seriesId: "kr_ip", category: "growth", label: "산업생산" },
  { seriesId: "kr_exports", category: "growth", label: "수출" },
  { seriesId: "kr_employment_rate", category: "labor", label: "고용률" },
  { seriesId: "kr_cb_spread_aa", category: "credit", label: "회사채 스프레드(AA-)" },
  { seriesId: "wti_oil", category: "commodities", label: "WTI" },
  { seriesId: "brent_oil", category: "commodities", label: "브렌트유" },
  { seriesId: "kr_treasury_outstanding", category: "fiscal", label: "국채 발행잔액" },
  { seriesId: "kr_fiscal_balance", category: "fiscal", label: "재정수지" },
  { seriesId: "ecos_kr_m2", category: "liquidity", label: "M2" },
];

export const INDICATOR_ANNOTATIONS_SSOT: IndicatorAnnotation[] = RAW_ANNOTATIONS
  .map((row) => IndicatorAnnotationSchema.parse({
    ...row,
    seriesId: normalizeSeriesId(row.seriesId),
  }))
  .sort((a, b) => a.seriesId.localeCompare(b.seriesId));

const ANNOTATION_BY_SERIES_ID = new Map(
  INDICATOR_ANNOTATIONS_SSOT.map((row) => [normalizeSeriesId(row.seriesId), row] as const),
);

function fallbackLabel(spec: SeriesSpec): string {
  const label = spec.name.trim();
  if (label) return label;
  return spec.id.replace(/_/g, " ").trim();
}

export function getIndicatorAnnotation(seriesId: string): IndicatorAnnotation {
  const normalized = normalizeSeriesId(seriesId);
  const found = ANNOTATION_BY_SERIES_ID.get(normalized);
  if (found) return found;
  return IndicatorAnnotationSchema.parse({
    seriesId: normalized || "unknown",
    category: "general",
    label: normalized || "unknown",
  });
}

export function buildIndicatorCatalogRows(specs: SeriesSpec[]): IndicatorCatalogRow[] {
  return specs
    .map((row) => SeriesSpecSchema.parse(row))
    .map((row) => {
      const annotation = getIndicatorAnnotation(row.id);
      return IndicatorCatalogRowSchema.parse({
        ...row,
        annotation,
        displayLabel: annotation.label || fallbackLabel(row),
      });
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
