"use client";

type Props = {
  isNew: boolean;
  isUpdated: boolean;
  isTouched: boolean;
};

function Flag({ label, className }: { label: string; className: string }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${className}`}>{label}</span>;
}

export function RowFlags({ isNew, isUpdated, isTouched }: Props) {
  return (
    <div className="flex flex-wrap gap-1">
      {isNew ? <Flag label="NEW" className="bg-emerald-100 text-emerald-800" /> : null}
      {isUpdated ? <Flag label="UPDATED" className="bg-amber-100 text-amber-900" /> : null}
      {isTouched ? <Flag label="TOUCHED" className="bg-sky-100 text-sky-800" /> : null}
    </div>
  );
}
