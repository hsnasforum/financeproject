# API Error Contract

## 공통 실패 응답

모든 API 실패 응답은 아래 shape를 따른다.

```json
{
  "ok": false,
  "error": {
    "code": "INPUT",
    "message": "입력값이 올바르지 않습니다.",
    "issues": ["kind must be one of deposit|saving"],
    "debug": {
      "traceId": "..."
    }
  }
}
```

- `error.code`: 에러 코드 문자열
- `error.message`: 사용자/운영자가 이해 가능한 요약 메시지
- `error.issues`: 필드 단위 검증 실패 목록(선택)
- `error.debug`: 진단 정보(선택)

## 진단 필드 해석

- 현재 공통 실패 계약은 `traceId` 최상위 필드를 강제하지 않는다.
- `traceId`가 있다면 `error.debug.traceId` 같은 진단 컨텍스트에서 해석하며, 로그 상관관계 추적이나 운영 문의 연결용으로만 사용한다.
- `traceId` 부재만으로 실패 응답 계약 위반으로 판단하지 않는다.

## 상태코드 매핑

- `INPUT` -> `400`
- `INVALID_DATE_FORMAT` -> `400`
- `NO_DATA` -> `404`
- `ENV_MISSING` -> `400`
- `UPSTREAM` / `HTTP` / `INTERNAL` -> `502`
- 명시되지 않은 코드는 기본 `502`

## 대표 의미 구분

- `Unauthorized`(`UNAUTHORIZED`)는 현재 인증, 잠금 해제, 권한 전제가 맞지 않아 요청을 허용할 수 없는 실패를 뜻한다.
- `ValidationError`(`VALIDATION_ERROR` 계열)는 요청이 검증 단계에 도달했지만 필드, 스키마, 도메인 규칙을 통과하지 못한 실패를 뜻한다.
- 현재 저장소에 없는 인증 구현 세부를 문서에서 추가로 가정하지 않는다.

## issues 규칙

- `issues`는 문자열 배열로 반환한다.
- 형식 권장: `"path message"`
  - 예: `"limit must be between 1 and 1000"`
  - 예: `"mode Integrated mode requires finlife as canonical source."`
- 단일 메시지보다 `issues`를 우선 신뢰하고 해석한다.
