"use client";

import { useMemo } from "react";
import { SIDO_LIST, findSidoByLawdCd } from "@/lib/housing/lawdRegions";

type Props = {
  lawdCd: string;
  onChangeLawdCd: (lawdCd: string) => void;
  label?: string;
};

export function RegionSelector({ lawdCd, onChangeLawdCd, label = "지역" }: Props) {
  const selectedSidoName = useMemo(() => findSidoByLawdCd(lawdCd)?.sidoName ?? SIDO_LIST[0].name, [lawdCd]);

  const sigunguOptions = useMemo(() => {
    return SIDO_LIST.find((sido) => sido.name === selectedSidoName)?.sigungu ?? [];
  }, [selectedSidoName]);

  return (
    <div>
      <span className="text-sm">{label}</span>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <select
          className="block h-10 w-full rounded-xl border border-border px-3"
          value={selectedSidoName}
          onChange={(e) => {
            const nextSido = e.target.value;
            const first = SIDO_LIST.find((sido) => sido.name === nextSido)?.sigungu[0];
            if (first) onChangeLawdCd(first.lawdCd);
          }}
        >
          {SIDO_LIST.map((sido) => (
            <option key={sido.name} value={sido.name}>{sido.name}</option>
          ))}
        </select>

        <select
          className="block h-10 w-full rounded-xl border border-border px-3"
          value={lawdCd}
          onChange={(e) => onChangeLawdCd(e.target.value)}
        >
          {sigunguOptions.map((sigungu) => (
            <option key={sigungu.lawdCd} value={sigungu.lawdCd}>{sigungu.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
