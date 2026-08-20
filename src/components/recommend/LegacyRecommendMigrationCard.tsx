"use client";

import { useEffect, useState } from "react";
import { buildBundle } from "@/lib/backup/backupBundle";
import { downloadText } from "@/lib/browser/download";
import { useRecommendOwner } from "@/lib/recommend/RecommendOwnerContext";
import {
  hasLegacyRecommendStorage,
  LEGACY_RECOMMEND_RESOLVED_EVENT,
  legacyRecommendDismissSessionKey,
  migrateLegacyRecommendStorage,
  readLegacyRecommendStorageMap,
} from "@/lib/recommend/legacyStorageMigration";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function LegacyRecommendMigrationCard() {
  const ownerId = useRecommendOwner();
  const [available, setAvailable] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(legacyRecommendDismissSessionKey(ownerId)) === "1") {
        setAvailable(false);
        return;
      }
      setAvailable(hasLegacyRecommendStorage(window.localStorage));
    } catch {
      setAvailable(false);
    }
  }, [ownerId]);

  if (!available && !notice && !error) return null;

  function handleMigrate() {
    setWorking(true);
    setNotice("");
    setError("");
    try {
      const result = migrateLegacyRecommendStorage(ownerId, window.localStorage);
      if (result.migratedLegacyKeys.length < 1) {
        setError("현재 계정 데이터와 충돌하거나 형식을 확인할 수 없어 자동으로 가져오지 않았습니다. 먼저 JSON으로 보관해 주세요.");
        return;
      }
      window.location.reload();
    } catch {
      setError("이전 추천 데이터를 가져오지 못했습니다. 원본 데이터는 그대로 유지했습니다.");
    } finally {
      setWorking(false);
    }
  }

  function handleDismiss() {
    try {
      window.sessionStorage.setItem(legacyRecommendDismissSessionKey(ownerId), "1");
    } catch {
      // The current page can still continue without a persisted session choice.
    }
    setAvailable(false);
    setNotice("");
    setError("");
    window.dispatchEvent(new Event(LEGACY_RECOMMEND_RESOLVED_EVENT));
  }

  function handleExport() {
    setNotice("");
    setError("");
    try {
      const bundle = buildBundle({
        serverFilesMap: {},
        clientStorageMap: readLegacyRecommendStorageMap(window.localStorage),
      });
      downloadText(
        `recommend-legacy-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(bundle, null, 2),
        "application/json;charset=utf-8",
      );
      setNotice("이전 추천 데이터를 JSON 백업으로 보관했습니다.");
    } catch {
      setError("이전 추천 데이터 백업을 만들지 못했습니다.");
    }
  }

  return (
    <Card className="mb-8 rounded-[2rem] border-amber-200 bg-amber-50/70 p-6" data-testid="recommend-legacy-migration">
      <p className="text-sm font-black text-amber-900">이전 방식으로 저장된 추천 데이터가 있습니다.</p>
      <p className="mt-2 text-xs font-medium leading-relaxed text-amber-800">
        사용자 계정을 임의로 연결하지 않았습니다. 본인 데이터가 맞다면 현재 로그인 계정으로 복사할 수 있으며,
        복사가 성공하기 전까지 원본은 삭제하지 않습니다. 현재 계정에 이미 있는 추천 조건과 최근 결과는 덮어쓰지 않습니다.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" size="sm" disabled={working} onClick={handleMigrate}>
          {working ? "가져오는 중..." : "현재 계정으로 가져오기"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={working} onClick={handleExport}>
          먼저 JSON으로 보관
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={working} onClick={handleDismiss}>
          이전 데이터는 그대로 두고 계속
        </Button>
      </div>
      {notice ? <p className="mt-3 text-xs font-bold text-emerald-700" role="status">{notice}</p> : null}
      {error ? <p className="mt-3 text-xs font-bold text-rose-700" role="alert">{error}</p> : null}
    </Card>
  );
}
