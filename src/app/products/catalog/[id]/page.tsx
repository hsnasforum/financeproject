import type { Metadata } from "next";
import { UnifiedProductDetailClient } from "@/components/UnifiedProductDetailClient";
import {
  buildPublicProductDetailMetadata,
  PUBLIC_PAGE_METADATA,
} from "@/lib/navigation/publicMetadata";
import { isSamplebankProductId, isSamplebankPublicAccessAllowed } from "@/lib/products/samplebankPolicy";
import { getUnifiedProductById } from "@/lib/sources/unified";

type DetailPageParams = {
  id?: string;
};

function decodeProductId(rawId: string): string {
  const normalized = rawId.trim();
  if (!normalized) return "";
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<DetailPageParams>;
}): Promise<Metadata> {
  const resolved = await params;
  const id = decodeProductId(typeof resolved.id === "string" ? resolved.id : "");
  if (!id) return PUBLIC_PAGE_METADATA["/products/catalog/[id]"];

  if (isSamplebankProductId(id) && !isSamplebankPublicAccessAllowed()) {
    return buildPublicProductDetailMetadata({ id });
  }

  try {
    const item = await getUnifiedProductById({ id, includeTimestamps: false });
    return buildPublicProductDetailMetadata({
      id,
      productName: item?.productName,
      providerName: item?.providerName,
    });
  } catch {
    return buildPublicProductDetailMetadata({ id });
  }
}

export default async function UnifiedProductDetailPage({
  params,
}: {
  params: Promise<DetailPageParams>;
}) {
  const resolved = await params;
  const rawId = typeof resolved.id === "string" ? resolved.id : "";
  const id = decodeProductId(rawId);
  return <UnifiedProductDetailClient id={id} />;
}
