"use client";

import { useEffect, useMemo, useState, type InputHTMLAttributes } from "react";

type NumberFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
};

function parseNumericText(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatWithComma(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  const isInteger = Number.isInteger(value);
  if (isInteger) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function NumberField({
  value,
  onValueChange,
  inputMode = "numeric",
  className = "",
  onBlur,
  onFocus,
  ...props
}: NumberFieldProps) {
  const formatted = useMemo(() => formatWithComma(value), [value]);
  const [text, setText] = useState(formatted);

  useEffect(() => {
    setText(formatted);
  }, [formatted]);

  return (
    <input
      {...props}
      type="text"
      inputMode={inputMode}
      value={text}
      onFocus={(event) => {
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        const parsed = parseNumericText(raw);
        if (raw.trim() === "") {
          setText("");
          onValueChange(null);
          return;
        }
        if (parsed === null) {
          setText(raw);
          return;
        }
        setText(formatWithComma(parsed));
        onValueChange(parsed);
      }}
      onBlur={(event) => {
        const parsed = parseNumericText(event.target.value);
        if (event.target.value.trim() === "") {
          setText("");
          onValueChange(null);
        } else if (parsed !== null) {
          setText(formatWithComma(parsed));
          onValueChange(parsed);
        }
        onBlur?.(event);
      }}
      className={className}
    />
  );
}
