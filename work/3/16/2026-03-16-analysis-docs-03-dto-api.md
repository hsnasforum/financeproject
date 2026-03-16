# 2026-03-16 analysis_docs DTO API 명세 정비

## 변경 파일
- `analysis_docs/03_DTO_API_명세서.md`

## 이번 배치에서 다룬 문서
- `analysis_docs/03_DTO_API_명세서.md`

## 사용 skill
- `work-log-closeout`: 배치 단위 변경 파일, 실제 검증, 남은 쟁점을 `/work` 형식으로 남기는 데 사용.

## 변경 이유
- 현재 API 구현과 대조했을 때 Unified Catalog 성공 응답 구조와 일부 planning DTO 타입 설명이 문서보다 낡아져 있었습니다.
- 휴지통 복구/비우기 API는 현재 화면에서 사용 중인데 문서 주요 API 목록에 빠져 있어 최소 범위에서 보강할 필요가 있었습니다.

## 현행과 달라서 고친 내용
- `PlanningRunRecord.input.assumptionsOverride`를 광범위한 `Record<string, unknown>`에서 `Partial<AssumptionsV2>` 기준으로 좁혔습니다.
- Unified Catalog 성공 응답을 실제 구현에 맞게 `data.items`, `data.merged`, `data.pageInfo`, top-level `fetchedAt` 구조로 수정했습니다.
- `pageInfo`가 item 필드가 아니라 `data.pageInfo`라는 점과, debug 허용 환경에서만 `meta.debug`/`diagnostics`가 붙을 수 있다는 점을 메모로 보강했습니다.
- `DELETE /api/planning/v2/trash` 성공 응답을 현재 코드 기준 `{ kind, id, deleted: true }`로 명시했습니다.
- 현재 존재하는 `POST /api/planning/v2/trash/restore`, `POST /api/planning/v2/trash/empty`를 주요 API 목록에 추가했습니다.
- `POST /api/recommend`의 query `topN` override 가능성은 `[검증 필요]`로 낮춰 표시했습니다.

## 검증
- `git diff --check -- analysis_docs/03_DTO_API_명세서.md`

## 아직 남은 쟁점
- `POST /api/recommend`의 `topN` query override는 현재 코드상 존재하지만, 사용자용 계약으로 적극 문서화할 수준인지 정책 판단이 더 필요합니다.
- planning report/export/download 계열은 실제 엔드포인트가 더 많지만 이번 배치에서는 오래된 부분만 바로잡고, 상세 계약 정리는 후순위로 남겼습니다.

## 다음 우선순위
- `analysis_docs/04_QA_명세서.md`에서 실제 `tests/e2e/*.spec.ts`와 QA 시나리오가 어긋난 항목만 찾아 최소 수정하기.
