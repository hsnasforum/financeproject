# 2026-07-10 Issue #197 FINLIFE sync 진입점 단일화

## 변경 파일

- `docs/finlife-sync.md`
- `scripts/finlife_sync.ts` 삭제
- `scripts/finlife_sync_if_stale.ts` 삭제
- `tests/finlife-sync-entrypoint-contract.test.ts`
- `work/7/10/2026-07-10-source-finlife-wrapper-removal.md`

## 사용 skill

- `finance-skill-routing`: #197 후속을 FINLIFE sync entrypoint ownership 범위로 축소
- `dart-data-source-hardening`: snapshot-only 경로가 운영 sync 성공으로 오해되지 않는지 확인
- `planning-gate-selector`: static entrypoint guard, lint, full test 검증 선택
- `work-log-closeout`: 삭제 근거, 검증, 외부 자동화 리스크를 한글 handoff로 기록
- `github:github`: Issue #197과 PR #200 병합 후 남은 ownership 범위 확인
- `manager` subagent: stale TS entrypoint 제거와 guard를 첫 구현 경계로 선정
- `reviewer` subagent: package script/AST guard 우회면을 찾고 수정 후 재검토

## 변경 이유

- package scripts, docs, tests는 `scripts/finlife_sync.mjs`와 `finlife_sync_if_stale.mjs`만 사용하지만 같은 이름의 TypeScript script 두 개가 남아 있었습니다.
- 두 TypeScript script는 Prisma 상품 DB를 갱신하지 않고 `runFinlifeSnapshotSync`만 호출해 운영 `.mjs` 경로와 다른 성공 의미를 제공했습니다.
- 직접 실행될 경우 snapshot은 fresh인데 unified query DB는 갱신되지 않는 #197 ownership 불일치를 다시 만들 수 있었습니다.

## 핵심 변경

- 저장소 내부 참조가 없는 snapshot-only TypeScript sync entrypoint 두 개를 삭제했습니다.
- 운영 sync의 canonical 진입점을 `pnpm finlife:sync`, `pnpm finlife:sync:if-stale`와 대응 `.mjs` 파일로 문서화했습니다.
- package script와 `products:sync` 명령을 exact contract로 고정했습니다.
- `scripts`와 `src` 전체를 TypeScript AST로 검사해 `runFinlifeSnapshotSync` 직접 import consumer를 `unifiedLoaders.ts` 하나로 제한했습니다.
- package command의 삭제된 TS 경로, `src/**/finlife` 직접 실행과 Windows-style module specifier 우회도 guard합니다.

## 검증

- 저장소 참조 검색: package/docs/tests/scripts는 `.mjs` 경로만 사용하고 삭제된 `.ts` 파일명 참조 없음
- 최종 focused Vitest 5 files / 14 tests: PASS
- `corepack pnpm lint`: PASS, 최종 86.8초
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS, 88.8초
- reviewer 1차: `products:sync` 부분 일치, package wrapper, substring scan 공백 확인
- reviewer 2차: `src/**` wrapper와 Windows-style specifier 공백 확인
- reviewer 최종: actionable finding 없음
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS, closeout 작성 전 확인
- 미실행: `corepack pnpm build`, 실제 `pnpm finlife:sync`, `pnpm finlife:sync:if-stale`, `pnpm products:sync`, E2E, production smoke, `corepack pnpm release:verify`
- route/page/runtime/DB 구현과 package script를 변경하지 않고 미사용 script 삭제 및 static guard만 추가해 build와 실제 data mutation command는 실행하지 않았습니다.

## 계약 영향

- Public URL/API/HTTP 응답 shape 변경 없음.
- DB schema, Prisma query/write semantics 변경 없음.
- HTTP cache/revalidation 및 애플리케이션 cache 변경 없음.
- package script 명령과 `.mjs` runtime 동작 변경 없음.
- 저장소 내부에서 지원되는 FINLIFE CLI 진입점만 `.mjs` package script로 단일화됐습니다.

## 남은 리스크

- 저장소 밖 scheduler, Task Scheduler, 개인 script가 삭제된 `.ts` 경로를 직접 호출하는지는 확인할 수 없습니다. 해당 자동화가 있으면 package script로 전환해야 합니다.
- runtime `runFinlifeSnapshotSync`가 snapshot-only이고 unified query가 Prisma `Product`를 읽는 내부 ownership 불일치는 남아 있습니다.
- snapshot `generatedAt`, unified `onlyNew`, DB completion evidence 정렬도 Issue #197 후속입니다.
- 롤백 기준은 저장소 내부 실제 호출면 누락, package script 성공 의미 변화, canonical `.mjs` 경로 실패, public/DB/cache 계약 변화입니다.

## 다음 라운드

1. Issue #197 연결 PR을 게시하고 리뷰, conflict, Actions job step 실행 여부를 확인합니다.
2. 다음 구현은 runtime snapshot refresh가 DB-backed completion을 요구하도록 adapter boundary를 분리하는 방향으로 진행합니다.
3. `ExternalSourceSnapshot` 재사용이 새 Prisma semantics를 만들면 별도 Issue/PR에 breaking 여부를 먼저 기록합니다.
