# financeproject 분석 문서 세트

작성 기준
- 대상 저장소: `https://github.com/hsnasforum/financeproject`
- 분석 시점: 2026-03-14
- 기준 브랜치: public `main`
- 분석 방식: 공개 저장소의 README, docs, route/page, API route, 타입 정의, 테스트 스펙에 대한 정적 분석

문서 성격
- 이 문서는 **실행 결과 검증본이 아니라 저장소 정적 분석본**입니다.
- 따라서 성능 수치, 실제 배포 환경 변수, 운영 데이터 적재량, 외부 API 장애율은 확정하지 않았습니다.
- 각 문서에서 내용을 다음 3종으로 구분했습니다.
  - `[현행 확인]`: 저장소 파일에서 직접 확인한 내용
  - `[해석]`: 확인된 사실을 바탕으로 한 구조 해석
  - `[권장]`: 더 나은 방향을 위한 제안

산출물
1. `01_현행분석_및_개선기획서.md`
2. `02_화면정의서.md`
3. `03_DTO_API_명세서.md`
4. `04_QA_명세서.md`
5. `05_개선로드맵_백로그.md`

분석에 많이 반영한 파일
- `README.md`
- `docs/current-screens.md`
- `docs/routes-inventory.md`
- `docs/planning-v2-onepage.md`
- `docs/planning-v2-architecture.md`
- `docs/planning-v2-user.md`
- `docs/planning-v3-kickoff.md`
- `docs/frontend-design-spec.md`
- `docs/data-sources-settings-ops.md`
- `docs/unified-catalog-contract.md`
- `USER_GUIDE.md`
- `src/app/**/page.tsx`
- `src/app/api/**/route.ts`
- `src/lib/planning/**`
- `src/lib/recommend/types.ts`
- `prisma/schema.prisma`
- `tests/e2e/*.spec.ts`

권장 활용 순서
1. `01_현행분석_및_개선기획서.md`로 전체 방향 확인
2. `02_화면정의서.md`로 IA/화면 책임 정리
3. `03_DTO_API_명세서.md`로 계약 정규화
4. `04_QA_명세서.md`로 회귀 테스트 범위 확정
5. `05_개선로드맵_백로그.md`로 실제 작업 티켓화

운영 메모
- `analysis_docs/**`와 관련 `analysis-docs-*` 메모는 현재 Git 추적 대상으로 관리합니다.
- 대표본/후속기록 구분과 보존 원칙은 `work/3/16/2026-03-16-analysis-docs-ops-policy.md`를 기준으로 유지합니다.
- 이번 배치에서는 rename, delete, merge 없이 현재 파일 구성을 그대로 보존합니다.
- 상세 운영 기준과 `/work` 메모 규칙은 `work/3/16/2026-03-16-analysis-docs-ops-policy.md`를 기준으로 봅니다.
