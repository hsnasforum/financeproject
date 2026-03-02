import { type EvidenceItem } from "@/lib/planning/v2/insights/evidence";

type Props = {
  item: EvidenceItem;
  className?: string;
};

export default function EvidencePanel({ item, className }: Props) {
  const cls = className ? ` ${className}` : "";
  return (
    <details className={`rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700${cls}`}>
      <summary className="cursor-pointer font-semibold text-slate-900" data-testid={`evidence-toggle-${item.id}`}>
        근거 보기
      </summary>
      <div className="mt-2 space-y-2" data-testid={`evidence-panel-${item.id}`}>
        <p className="font-semibold text-slate-900">{item.title}</p>
        <p className="text-[11px] text-slate-600">공식: {item.formula}</p>
        <div>
          <p className="text-[11px] text-slate-600">입력:</p>
          <ul className="list-disc pl-4">
            {item.inputs.map((input, index) => (
              <li key={`${item.id}:input:${index}`}>{input.label}: {input.value}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] text-slate-600">가정:</p>
          <ul className="list-disc pl-4">
            {item.assumptions.map((assumption, index) => (
              <li key={`${item.id}:assumption:${index}`}>{assumption}</li>
            ))}
          </ul>
        </div>
        {item.notes && item.notes.length > 0 ? (
          <div>
            <p className="text-[11px] text-slate-600">참고:</p>
            <ul className="list-disc pl-4">
              {item.notes.map((note, index) => (
                <li key={`${item.id}:note:${index}`}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
