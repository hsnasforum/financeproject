const KNOWN_FIX_IDS = [
  "PRISMA_DB_PUSH",
  "PRISMA_PUSH",
  "SEED_DEBUG",
  "DATA_DOCTOR",
  "DART_WATCH",
  "DAILY_REFRESH",
] as const;

type AllowedFixId = (typeof KNOWN_FIX_IDS)[number];

const KNOWN_CHAIN_IDS = ["DB_REPAIR", "DART_SETUP", "FULL_REPAIR"] as const;

function isAllowedFixId(value: string): value is AllowedFixId {
  return (KNOWN_FIX_IDS as readonly string[]).includes(value);
}

function isChainId(value: string): value is (typeof KNOWN_CHAIN_IDS)[number] {
  return (KNOWN_CHAIN_IDS as readonly string[]).includes(value);
}

type OpsTicketLike = {
  message?: string;
  tags?: string[];
  priority?: string;
  note?: string;
};

export type OpsAction = {
  kind: "CHAIN" | "FIX";
  id: string;
  cause?: string;
  suggestedFixIds?: AllowedFixId[];
};

function norm(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normUpper(value: unknown): string {
  return norm(value).toUpperCase();
}

function splitTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => norm(entry))
    .filter((entry) => entry.length > 0);
}

function parseSuggestedFixIdsFromNote(note: string): AllowedFixId[] {
  const line = note
    .split("\n")
    .find((row) => row.toLowerCase().includes("suggestedfixids:"));
  if (!line) return [];
  const raw = line.split(":").slice(1).join(":").trim();
  if (!raw || raw === "-") return [];
  const out: AllowedFixId[] = [];
  const seen = new Set<AllowedFixId>();
  for (const token of raw.split(",")) {
    const fixId = token.trim();
    if (!fixId || !isAllowedFixId(fixId) || seen.has(fixId)) continue;
    seen.add(fixId);
    out.push(fixId);
    if (out.length >= 8) break;
  }
  return out;
}

function parseMessage(message: string): { id?: string; cause?: string } {
  const matched = message.match(/\[OPS\]\[([^\]]+)\]\s*실패:\s*([^\n]+)/i);
  if (!matched) return {};
  return {
    id: matched[1]?.trim(),
    cause: matched[2]?.trim(),
  };
}

export function isOpsTicket(item: OpsTicketLike): boolean {
  const priorityP0 = normUpper(item.priority) === "P0";
  if (!priorityP0) return false;
  const tags = splitTags(item.tags).map((tag) => tag.toLowerCase());
  const hasOpsTag = tags.includes("ops");
  const message = norm(item.message);
  const hasOpsMessage = /^\[OPS\]\[[^\]]+\]/i.test(message);
  return hasOpsTag || hasOpsMessage;
}

export function parseOpsAction(item: OpsTicketLike): OpsAction | null {
  const tags = splitTags(item.tags);
  let kind: OpsAction["kind"] | undefined;
  let id = "";
  let cause = "";

  for (const tag of tags) {
    const chainMatched = tag.match(/^chain(?:id)?:(.+)$/i);
    if (chainMatched && isChainId(chainMatched[1].trim())) {
      kind = "CHAIN";
      id = chainMatched[1].trim();
      break;
    }
    const fixMatched = tag.match(/^fix(?:id)?:(.+)$/i);
    if (fixMatched && isAllowedFixId(fixMatched[1].trim())) {
      kind = "FIX";
      id = fixMatched[1].trim();
      break;
    }
  }

  if (!kind || !id) {
    for (const tag of tags) {
      if (isChainId(tag)) {
        kind = "CHAIN";
        id = tag;
        break;
      }
      if (isAllowedFixId(tag)) {
        kind = "FIX";
        id = tag;
        break;
      }
    }
  }

  const note = norm(item.note);
  if (!kind) {
    const typeLine = note
      .split("\n")
      .find((line) => /^-\s*type:\s*(FIX|CHAIN)\s*$/i.test(line.trim()));
    if (typeLine) {
      const parsedType = typeLine.split(":").slice(1).join(":").trim().toUpperCase();
      if (parsedType === "FIX" || parsedType === "CHAIN") {
        kind = parsedType;
      }
    }
  }

  const message = norm(item.message);
  const parsedMessage = parseMessage(message);
  if (!id && parsedMessage.id) id = parsedMessage.id;
  if (parsedMessage.cause) cause = parsedMessage.cause;

  if (!kind && id) {
    if (isChainId(id)) kind = "CHAIN";
    else if (isAllowedFixId(id)) kind = "FIX";
  }

  if (!kind || !id) return null;

  const suggestedFixIds = parseSuggestedFixIdsFromNote(note);
  return {
    kind,
    id,
    ...(cause ? { cause } : {}),
    ...(suggestedFixIds.length > 0 ? { suggestedFixIds } : {}),
  };
}
