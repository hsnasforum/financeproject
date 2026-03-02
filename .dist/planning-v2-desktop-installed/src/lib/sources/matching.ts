import { createHash } from "node:crypto";
import { type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

const STRIP_SUFFIXES = [/주식회사/g, /\(주\)/g, /㈜/g, /은행/g, /저축은행/g];

export function normalizeName(input: string): string {
  const base = input.normalize("NFKC").toLowerCase();
  const stripped = STRIP_SUFFIXES.reduce((acc, pattern) => acc.replace(pattern, ""), base);
  return stripped.replace(/[^\p{L}\p{N}]/gu, "").trim();
}

export function buildExternalKey(providerName: string, productName: string, kind: string): string {
  const raw = `${normalizeName(providerName)}|${normalizeName(productName)}|${kind}`;
  return createHash("sha1").update(raw).digest("hex");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + cost);
      diagonal = temp;
    }
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen > 0 ? Math.max(0, 1 - distance / maxLen) : 0;
}

function toInputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function updateExternalProductMatch(externalProductId: number): Promise<void> {
  const external = await prisma.externalProduct.findUnique({
    where: { id: externalProductId },
  });
  if (!external) return;

  const providers = await prisma.provider.findMany({
    include: {
      aliases: true,
      products: {
        select: { id: true, name: true },
      },
    },
  });

  let best: {
    internalProductId: number | null;
    method: string;
    confidence: number;
    evidenceJson: Record<string, unknown>;
  } | null = null;

  for (const provider of providers) {
    const providerNorm = normalizeName(provider.name);
    const aliasNorms = provider.aliases.map((alias) => alias.aliasNorm);
    const providerExact = providerNorm === external.providerNameNorm || aliasNorms.includes(external.providerNameNorm);
    const providerScore = providerExact
      ? 1
      : Math.max(
          similarity(providerNorm, external.providerNameNorm),
          ...aliasNorms.map((aliasNorm) => similarity(aliasNorm, external.providerNameNorm)),
        );

    if (providerScore < 0.85) continue;

    for (const product of provider.products) {
      const nameNorm = normalizeName(product.name ?? "");
      if (!nameNorm) continue;
      const productScore = similarity(nameNorm, external.productNameNorm);
      const confidence = 0.45 * providerScore + 0.55 * productScore;
      const method = providerExact
        ? productScore >= 0.999
          ? "providerNameExact+productExact"
          : "providerNameExact+fuzzyName"
        : "providerFuzzy+fuzzyName";

      if (!best || confidence > best.confidence) {
        best = {
          internalProductId: confidence >= 0.92 ? product.id : null,
          method,
          confidence,
          evidenceJson: {
            providerNorm,
            externalProviderNorm: external.providerNameNorm,
            providerScore,
            productNorm: nameNorm,
            externalProductNorm: external.productNameNorm,
            productScore,
            thresholdAutoLink: 0.92,
          },
        };
      }
    }
  }

  await prisma.externalProductMatch.deleteMany({
    where: { externalProductId },
  });

  if (!best) return;

  await prisma.externalProductMatch.create({
    data: {
      externalProductId,
      internalProductId: best.internalProductId,
      method: best.method,
      confidence: best.confidence,
      evidenceJson: toInputJson(best.evidenceJson),
    },
  });
}
