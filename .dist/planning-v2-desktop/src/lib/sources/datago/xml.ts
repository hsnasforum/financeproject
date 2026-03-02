function extractTagValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function decodeXml(input: string): string {
  return input
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

export function parseKdbDepositXml(xml: string): {
  items: Record<string, unknown>[];
  totalCount: number;
  numOfRows: number;
  pageNo: number;
} {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1] ?? "");
  const items = itemBlocks.map((block) => {
    const row: Record<string, unknown> = {};
    for (const pair of block.matchAll(/<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
      const key = pair[1];
      const value = decodeXml((pair[2] ?? "").trim());
      row[key] = value;
    }
    return row;
  });

  const totalCount = Number(extractTagValue(xml, "totalCount") ?? items.length);
  const rowsBase = extractTagValue(xml, "numOfRows") ?? String(items.length || 100);
  const numOfRows = Number(rowsBase);
  const pageNo = Number(extractTagValue(xml, "pageNo") ?? 1);

  return {
    items,
    totalCount: Number.isFinite(totalCount) ? totalCount : items.length,
    numOfRows: Number.isFinite(numOfRows) && numOfRows > 0 ? numOfRows : 100,
    pageNo: Number.isFinite(pageNo) && pageNo > 0 ? pageNo : 1,
  };
}
