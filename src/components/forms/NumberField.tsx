"use client";

import { useEffect, useMemo, useRef, type InputHTMLAttributes } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = formatted;
    }
  }, [formatted]);

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode={inputMode}
      defaultValue={formatted}
      onFocus={(event) => {
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        const parsed = parseNumericText(raw);
        if (raw.trim() === "") {
          event.currentTarget.value = "";
          onValueChange(null);
          return;
        }
        if (parsed === null) {
          return;
        }
        event.currentTarget.value = formatWithComma(parsed);
        onValueChange(parsed);
      }}
      onBlur={(event) => {
        const parsed = parseNumericText(event.target.value);
        if (event.target.value.trim() === "") {
          event.currentTarget.value = "";
          onValueChange(null);
        } else if (parsed !== null) {
          event.currentTarget.value = formatWithComma(parsed);
          onValueChange(parsed);
        }
        onBlur?.(event);
      }}
      className={className}
    />
  );
}
