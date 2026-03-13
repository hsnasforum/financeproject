import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  NewsNoteSchema,
  type NewsNote,
  type NewsNoteTargetType,
} from "./contracts";
import { resolveNewsRootDir } from "./rootDir";
import { parseWithV3Whitelist } from "../security/whitelist";

const NoteIdSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{8,128}$/);

const CreateNewsNoteInputSchema = z.object({
  targetType: z.enum(["item", "topic", "scenario"]),
  targetId: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  note: z.string().trim().min(1),
  createdAt: z.string().datetime().optional(),
});

const UpdateNewsNoteInputSchema = z.object({
  tags: z.array(z.string().trim().min(1)).optional(),
  note: z.string().trim().min(1).optional(),
}).refine((value) => value.tags !== undefined || value.note !== undefined, {
  message: "at least one field required",
});

export type NewsNoteRecord = NewsNote & {
  id: string;
};

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function safeNoteId(noteId: string): string {
  return NoteIdSchema.parse(noteId);
}

function notePath(noteId: string, rootDir = resolveNewsRootDir()): string {
  return path.join(resolveNewsNotesDir(rootDir), `${safeNoteId(noteId)}.json`);
}

export function resolveNewsNotesDir(rootDir = resolveNewsRootDir()): string {
  return path.join(rootDir, "notes");
}

function readNoteFile(filePath: string): NewsNoteRecord | null {
  const noteId = path.basename(filePath, ".json");
  if (!NoteIdSchema.safeParse(noteId).success) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    const note = NewsNoteSchema.parse(raw);
    return {
      id: noteId,
      ...note,
      tags: dedupeTags(note.tags),
    };
  } catch {
    return null;
  }
}

export function listNewsNotes(input?: {
  targetType?: NewsNoteTargetType;
  targetId?: string;
}, rootDir = resolveNewsRootDir()): NewsNoteRecord[] {
  const dir = resolveNewsNotesDir(rootDir);
  if (!fs.existsSync(dir)) return [];

  const all: NewsNoteRecord[] = [];
  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith(".json")) continue;
    const row = readNoteFile(path.join(dir, fileName));
    if (!row) continue;
    if (input?.targetType && row.targetType !== input.targetType) continue;
    if (input?.targetId && row.targetId !== input.targetId) continue;
    all.push(row);
  }

  all.sort((a, b) => {
    const left = Date.parse(a.createdAt);
    const right = Date.parse(b.createdAt);
    const leftTs = Number.isFinite(left) ? left : 0;
    const rightTs = Number.isFinite(right) ? right : 0;
    if (leftTs !== rightTs) return rightTs - leftTs;
    return b.id.localeCompare(a.id);
  });
  return all;
}

export function createNewsNote(
  input: {
    targetType: NewsNoteTargetType;
    targetId: string;
    tags?: string[];
    note: string;
    createdAt?: string;
  },
  rootDir = resolveNewsRootDir(),
): NewsNoteRecord {
  const parsed = CreateNewsNoteInputSchema.parse(input);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const payload = NewsNoteSchema.parse({
    targetType: parsed.targetType,
    targetId: parsed.targetId,
    tags: dedupeTags(parsed.tags),
    note: parsed.note,
    createdAt,
  });
  const safePayload = parseWithV3Whitelist(NewsNoteSchema, payload, {
    scope: "persistence",
    context: "news.notes.create",
  });

  const noteId = crypto.randomUUID().replaceAll("-", "");
  const dir = resolveNewsNotesDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${noteId}.json`), `${JSON.stringify(safePayload, null, 2)}\n`, "utf-8");

  return {
    id: noteId,
    ...safePayload,
  };
}

export function updateNewsNote(
  noteId: string,
  patch: {
    tags?: string[];
    note?: string;
  },
  rootDir = resolveNewsRootDir(),
): NewsNoteRecord | null {
  const filePath = notePath(noteId, rootDir);
  if (!fs.existsSync(filePath)) return null;
  const current = readNoteFile(filePath);
  if (!current) return null;

  const parsedPatch = UpdateNewsNoteInputSchema.parse(patch);
  const updated = NewsNoteSchema.parse({
    targetType: current.targetType,
    targetId: current.targetId,
    createdAt: current.createdAt,
    tags: parsedPatch.tags ? dedupeTags(parsedPatch.tags) : current.tags,
    note: parsedPatch.note ?? current.note,
  });
  const safeUpdated = parseWithV3Whitelist(NewsNoteSchema, updated, {
    scope: "persistence",
    context: "news.notes.update",
  });

  fs.writeFileSync(filePath, `${JSON.stringify(safeUpdated, null, 2)}\n`, "utf-8");
  return {
    id: current.id,
    ...safeUpdated,
  };
}

export function deleteNewsNote(noteId: string, rootDir = resolveNewsRootDir()): boolean {
  const filePath = notePath(noteId, rootDir);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}
