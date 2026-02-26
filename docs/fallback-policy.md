# Fallback Policy (P9)

## 목적
- 업스트림 장애(5xx/timeout), 레이트리밋(429), 키 미설정에서도 사용자 화면이 깨지지 않도록 응답 계약을 고정한다.
- 가능한 경우 `ok: true`를 유지하면서 `LIVE -> CACHE -> REPLAY` 순서로 degrade 한다.

## 우선순위
1. `LIVE`: 업스트림 실시간 호출 성공
2. `CACHE`: 최근 성공 응답 또는 스냅샷/캐시 응답
3. `REPLAY`: 로컬 리플레이 스냅샷 응답

## Degrade 규칙
- `429/5xx/timeout` 감지 시 source 단위 cooldown을 설정한다.
- cooldown 기간에는 LIVE 재호출을 생략하고 `CACHE` 또는 `REPLAY`를 우선 사용한다.
- API 키 미설정:
  - REPLAY 가능: `ok: true`, `meta.fallback.mode = "REPLAY"`
  - REPLAY 불가: `ok: false`, `error.code = "CONFIG_MISSING"`

## meta.fallback 계약
- 주요 API 응답의 `meta`에는 아래 필드를 포함한다.

```ts
type FallbackMeta = {
  mode: "LIVE" | "CACHE" | "REPLAY";
  sourceKey: string;
  reason?: string;
  generatedAt?: string;
  nextRetryAt?: string;
}
```

- `mode`가 `CACHE` 또는 `REPLAY`면 UI 배너로 사용자에게 표시한다.

## 에러 규격 (Day5)
- 실패 응답은 기존 규격을 유지한다.

```json
{
  "ok": false,
  "error": {
    "code": "STRING_CODE",
    "message": "사용자 친화 메시지",
    "debug": {}
  }
}
```

- fallback 불가 시에도 `error.code`/`error.message`는 반드시 채운다.
