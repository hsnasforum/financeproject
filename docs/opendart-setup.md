# OpenDART Setup

## 1) 환경 변수

- `OPENDART_API_KEY`: OpenDART 인증키 (필수)
- `OPENDART_BASE_URL`: 기본값 `https://opendart.fss.or.kr` (선택, 권장)
- `OPENDART_API_URL`: legacy alias. 이미 `.env.local`에서 이 이름을 쓰고 있으면 그대로 동작합니다.
- `DART_CORPCODES_INDEX_PATH`: corpCodes 인덱스 경로 (선택, 기본 `tmp/dart/corpCodes.index.json`)
- `DART_INDEX_BUILD_TOKEN`: production에서 인덱스 빌드 보호 토큰 (선택)

## 2) corpCodes 인덱스 생성

### 수동 생성

```bash
python3 scripts/dart_corpcode_build.py
```

경로 지정:

```bash
DART_CORPCODES_INDEX_PATH=tmp/dart/corpCodes.index.json python3 scripts/dart_corpcode_build.py
```

### 필요 시 자동 생성 시도

```bash
pnpm dart:ensure-corpindex
```

- 인덱스가 이미 있으면 스킵
- `OPENDART_API_KEY`가 없으면 스킵
- python 실행기가 없으면 스킵

## 3) UI/엔드포인트 동작

- 검색: `/public/dart` -> `/api/public/disclosure/corpcodes/search?q=...`
- 기업개황: `/public/dart/company?corpCode=...` -> `/api/public/disclosure/company`
- 인덱스 상태: `/api/public/disclosure/corpcodes/status`
- 인덱스 빌드: `POST /api/public/disclosure/corpcodes/build`
- 설정 진단: `/settings/data-sources`에서 OPENDART 키/인덱스 상태(존재 여부, 경로, generatedAt, count) 확인
- `/settings/data-sources` 운영 순서는 `docs/data-sources-settings-ops.md`를 기준으로 확인
- `/public/dart`는 최근 성공 검색어를 브라우저 로컬 저장소에 보관하고, 다음 방문 때 빠르게 다시 검색할 수 있는 칩을 보여줍니다.

개발 환경에서 인덱스가 없으면 `/public/dart` 화면에 `CORPCODES_INDEX_MISSING` payload와 자동 생성 버튼이 표시됩니다.

## 4) 에러 대응 가이드

- `409 CORPCODES_INDEX_MISSING`
  - corpCodes 인덱스 미생성 상태
  - 기본 응답의 `message`는 사용자 안내만 포함하며 `hintCommand/hintCommandWithPath` 키는 호환성을 위해 빈 문자열로 유지
  - 운영 명령은 명시적인 `debug=1` 진단 응답과 이 문서에서만 확인하고 public UI에는 표시하지 않음
  - UI는 `message/canAutoBuild/buildEndpoint/statusEndpoint`를 사용하고 개발 상세 화면에서 경로 상태를 확인
  - 개발 환경 + `canAutoBuild=true`이면 자동 생성 버튼 노출
- `CONFIG`
  - `OPENDART_API_KEY` 미설정 또는 설정 문제
- `AUTH` (`010`)
  - 키가 등록되지 않았거나 유효하지 않음
- `RATE_LIMIT` (`020`)
  - 요청 제한 초과. 잠시 후 재시도
- OpenDART HTTP 호출은 fetch, 본문 읽기, retry/backoff를 포함한 전체 deadline을 사용합니다.
- HTTP 오류는 본문 파싱보다 먼저 `upstreamStatus`와 `retryAfterSeconds`를 보존하므로, 오류 본문이 잘못된 JSON이어도 요청 제한과 제공처 장애를 구분할 수 있습니다.
- 호출자 취소는 `aborted=true`, deadline 초과는 `timeout=true`로 구분하며 호출자 취소를 제공처 장애로 집계하지 않습니다.

추가 매핑:

- `013 -> NO_DATA (404)`
- `011/012/901 -> FORBIDDEN (403)`
- `800 -> MAINTENANCE (503)`
- 기타 -> `UPSTREAM (502)`
