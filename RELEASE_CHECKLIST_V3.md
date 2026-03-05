# RELEASE_CHECKLIST_V3.md

V3 릴리즈 전 최종 점검 체크리스트입니다.

원칙:
- 저장소에 존재하는 명령/테스트만 사용
- v3 범위 중심 점검
- 로컬 데이터/보안/응답 정책 위반 여부를 출시 전에 차단

## 1) Scope Check (v3-only)
- [ ] 변경 파일이 v3 중심인지 확인 (`planning/v3/**`, `src/app/planning/v3/**`, `src/app/api/planning/v3/**`, 관련 테스트/문서)
```bash
git status --short
git diff --name-only
```
- [ ] v2 코드 변경이 섞였는지 수동 점검

## 2) `.data` 추적 금지 점검 (v3 데이터)
아래 v3 로컬 데이터 경로가 git 추적/스테이징되지 않았는지 확인:
- `.data/news/**`
- `.data/indicators/**`
- `.data/alerts/**`
- `.data/journal/**`
- `.data/exposure/**`
- `.data/planning_v3_drafts/**`

```bash
git ls-files .data/news .data/indicators .data/alerts .data/journal .data/exposure .data/planning_v3_drafts
git status --short .data/news .data/indicators .data/alerts .data/journal .data/exposure .data/planning_v3_drafts
```

## 3) 추천 단정 금지 가드
- [ ] 금지어 가드가 테스트로 유지되는지 확인
- 관련 구현:
  - `planning/v3/news/guard/noRecommendationText.ts`
  - `src/lib/news/noRecommendation.ts`
- 관련 테스트 예시:
  - `planning/v3/news/digest.test.ts`
  - `planning/v3/news/scenario.test.ts`
  - `planning/v3/news/triggerEvaluator.test.ts`
  - `planning/v3/financeNews/__tests__/impactModel.test.ts`
  - `planning/v3/financeNews/__tests__/stressRunner.test.ts`

## 4) Raw/Fulltext/CSV 비노출 정책
- [ ] 뉴스 저장/응답/로그에 `content/html/body/fulltext` 저장 없음
- [ ] CSV 원문이 응답/저장 식별자에 노출되지 않음
- 관련 테스트 예시:
  - `planning/v3/news/quality.test.ts`
  - `tests/planning-v3/csv-import.test.ts`
  - `tests/planning-v3-batches-import-csv-api.test.ts`
  - `tests/planning-v3-batches-api.test.ts`

## 5) Write-route Guard 점검 (local-only/same-origin/CSRF)
- [ ] v3 write route에서 guard 정책 유지
- [ ] 회귀 테스트 통과:
  - `tests/planning-v3-write-route-guards.test.ts`
  - `tests/news-exposure-api.test.ts`
  - `tests/planning-v3-journal-api.test.ts`
  - `tests/planning-v3-news-notes-api.test.ts`

참고 구현 예:
- `src/app/api/planning/v3/news/refresh/route.ts`
- `src/app/api/planning/v3/news/settings/route.ts`
- `src/app/api/planning/v3/journal/entries/route.ts`

## 6) 필수 검증 커맨드
- [ ] 테스트
```bash
pnpm test
```
- [ ] 빌드
```bash
pnpm build
```
- [ ] 데이터 무결성 Doctor
```bash
pnpm v3:doctor
```

## 7) Golden Tests (존재 시)
현재 golden 회귀 테스트 파일이 존재함:
- `planning/v3/qa/goldenPipeline.test.ts`

- [ ] 필요 시 개별 실행
```bash
pnpm test planning/v3/qa/goldenPipeline.test.ts
```

## 8) Release sign-off
- [ ] 위 1~7 항목 완료
- [ ] 실패 항목 0건
- [ ] 커밋/태그 전 최종 점검 로그 보관

