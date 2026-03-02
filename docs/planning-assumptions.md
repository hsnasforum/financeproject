# Planning Assumptions Snapshot

## 목적
- 재무설계 엔진은 순수 함수로 유지하고, 네트워크 요청을 직접 수행하지 않습니다.
- 외부 공개 지표(BOK/CPI)는 별도 "가정 스냅샷"으로 동기화하여 로컬 파일에 저장한 뒤 엔진에서 읽어 사용합니다.

## 동기화 방법
- CLI: `pnpm planning:assumptions:sync`
- Ops UI: `/ops/assumptions` 페이지에서 **Sync now** 버튼 실행
- 동기화는 서버에서만 수행되며(local-only + same-origin + dev unlock + csrf), 클라이언트 토큰/민감정보를 노출하지 않습니다.

## ECOS KeyStatisticList
- 기본 수집 경로는 ECOS Open API `KeyStatisticList` 입니다.
- 필수/옵션 환경변수:
  - `BOK_ECOS_API_KEY`
  - `ECOS_LANGUAGE` (기본 `kr`)
  - `ECOS_MAX_ROWS` (기본 `100`)
  - `ECOS_ENABLED` (기본 `true`)
- 키가 없거나 ECOS 호출/파싱에 실패하면 `ECOS_FALLBACK_USED` 경고를 남기고 기존 HTML 파싱 경로로 fallback 합니다.
- 수집 항목:
  - `policyRatePct` (한국은행 기준금리)
  - `callOvernightPct` (콜금리 익일물)
  - `cd91Pct` (CD수익률 91일)
  - `koribor3mPct` (KORIBOR 3개월)
  - `msb364Pct` (통안증권수익률 364일)

## 저장 위치
- 최신 스냅샷 파일: `.data/planning/assumptions.latest.json`
- 히스토리 파일: `.data/planning/assumptions/history/{snapshotId}.json`

## 실패 시 동작
- 동기화 실패 시 기존 최신 스냅샷 파일은 유지됩니다.
- 파싱 실패/소스 변경은 `warnings`에 기록되며, Ops 화면에서 확인할 수 있습니다.

## History / Replay
- Sync 시 스냅샷은 latest 갱신 전에 history에도 원자 저장됩니다.
- `snapshotId` 포맷은 기본적으로 `{asOf}_{fetchedAt(초단위)}`이며 충돌 시 `-2`, `-3` suffix가 붙습니다.
- planning API 재현 실행:
  - `POST /api/planning/v2/simulate` body에 `"snapshotId": "2026-02-28_2026-02-28-09-00-00"`를 넣으면 해당 스냅샷으로 계산합니다.
  - 응답 `meta.snapshot`에는 `id/asOf/fetchedAt`가 포함됩니다.
- OPS 롤백 절차:
  1. `/ops/assumptions/history`에서 스냅샷 선택
  2. confirm 입력: `SET_LATEST {snapshotId}`
  3. **Set as latest** 실행

## 감사 로그
- 동기화 시도는 성공/실패 모두 감사 로그에 기록됩니다.
- 이벤트: `ASSUMPTIONS_SYNC`
- 기록 필드: `result`, `asOf`, `fetchedAt`, `warningsCount`, `sourcesCount`, `message`

## 백업/복구
- 백업 export/import/restore point 대상에 `.data/planning/assumptions.latest.json`이 포함됩니다.
- assumptions history(`.data/planning/assumptions/history/*.json`)도 백업 대상에 포함됩니다.
- 복원 시 기존 백업 시스템 경로 whitelist 검증을 그대로 따릅니다.
