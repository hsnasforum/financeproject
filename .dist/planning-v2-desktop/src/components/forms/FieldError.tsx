import { type ReactNode } from "react";

type FieldErrorProps = {
  message?: ReactNode;
  className?: string;
  id?: string;
};

export function FieldError({ message, className, id }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} className={`mt-1 text-xs text-rose-700 ${className ?? ""}`.trim()} role="alert">
      {message}
    </p>
  );
}
