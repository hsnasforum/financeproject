"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FeedbackPriority = "P0" | "P1" | "P2" | "P3";
type FeedbackTask = {
  id: string;
  text: string;
  done: boolean;
};

type InlineTodoItem = {
  id: string;
  priority: FeedbackPriority;
  dueDate: string | null;
  tasks: FeedbackTask[];
};

export type InlineTodoPatch = {
  priority?: FeedbackPriority;
  dueDate?: string | null;
  tasks?: FeedbackTask[];
};

type InlineTodoEditorProps = {
  item: InlineTodoItem;
  onPatch: (patch: InlineTodoPatch) => Promise<{ ok: boolean; error?: string }>;
  disabled?: boolean;
};

function isTaskListEqual(a: FeedbackTask[], b: FeedbackTask[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!left || !right) return false;
    if (left.id !== right.id) return false;
    if (left.text !== right.text) return false;
    if (left.done !== right.done) return false;
  }
  return true;
}

export function InlineTodoEditor({ item, onPatch, disabled = false }: InlineTodoEditorProps) {
  const [priority, setPriority] = useState<FeedbackPriority>(item.priority);
  const [dueDate, setDueDate] = useState<string>(item.dueDate ?? "");
  const [tasks, setTasks] = useState<FeedbackTask[]>(item.tasks);
  const [saving, setSaving] = useState(false);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    setPriority(item.priority);
    setDueDate(item.dueDate ?? "");
    setTasks(item.tasks);
  }, [item.dueDate, item.id, item.priority, item.tasks]);

  const patch = useMemo<InlineTodoPatch>(() => {
    const next: InlineTodoPatch = {};
    if (priority !== item.priority) {
      next.priority = priority;
    }
    const normalizedDueDate = dueDate.trim() || null;
    if (normalizedDueDate !== (item.dueDate ?? null)) {
      next.dueDate = normalizedDueDate;
    }
    if (!isTaskListEqual(tasks, item.tasks)) {
      next.tasks = tasks;
    }
    return next;
  }, [dueDate, item.dueDate, item.priority, item.tasks, priority, tasks]);

  useEffect(() => {
    if (disabled) {
      setSaving(false);
      return;
    }
    const hasPatch = Object.keys(patch).length > 0;
    if (!hasPatch) {
      setSaving(false);
      return;
    }

    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        await onPatch(patch);
      } finally {
        if (requestSeqRef.current === seq) {
          setSaving(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [disabled, onPatch, patch]);

  const visibleTasks = tasks.slice(0, 3);

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-[11px] font-semibold text-slate-600">
          우선순위
          <select
            className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
            value={priority}
            onChange={(event) => setPriority(event.target.value as FeedbackPriority)}
            disabled={disabled}
          >
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600">
          마감일
          <input
            type="date"
            className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={disabled}
          />
        </label>
      </div>

      <div className="mt-2">
        <p className="text-[11px] font-semibold text-slate-600">체크리스트 (상위 3개)</p>
        {visibleTasks.length === 0 ? (
          <p className="mt-1 text-[11px] text-slate-400">체크리스트가 없습니다.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {visibleTasks.map((task) => (
              <li key={task.id}>
                <label className="inline-flex items-center gap-2 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={task.done}
                    disabled={disabled}
                    onChange={() => {
                      setTasks((prev) =>
                        prev.map((entry) => (entry.id === task.id ? { ...entry, done: !entry.done } : entry)),
                      );
                    }}
                  />
                  <span className={task.done ? "line-through text-slate-400" : ""}>{task.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {saving ? <p className="mt-2 text-[11px] font-semibold text-slate-500">자동 저장 중...</p> : null}
    </div>
  );
}
