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
    "debug": {}
  }
}
```

- `error.code`: 에러 코드 문자열
- `error.message`: 사용자/운영자가 이해 가능한 요약 메시지
- `error.issues`: 필드 단위 검증 실패 목록(선택)
- `error.debug`: 진단 정보(선택)

## 상태코드 매핑

- `INPUT` -> `400`
- `INVALID_DATE_FORMAT` -> `400`
- `NO_DATA` -> `404`
- `ENV_MISSING` -> `400`
- `UPSTREAM` / `HTTP` / `INTERNAL` -> `502`
- 명시되지 않은 코드는 기본 `502`

## issues 규칙

- `issues`는 문자열 배열로 반환한다.
- 형식 권장: `"path message"`
  - 예: `"limit must be between 1 and 1000"`
  - 예: `"mode Integrated mode requires finlife as canonical source."`
- 단일 메시지보다 `issues`를 우선 신뢰한다.
