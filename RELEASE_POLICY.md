# RELEASE_POLICY.md

`planning/v3` 릴리즈 운영 정책 문서입니다.

## 1) Versioning scheme (alpha -> stable)
`planning/v3`는 아래 단계로 승격합니다.

- `alpha`
  - 기능 개발/구조 변경이 활발한 단계
  - 내부 검증 중심, 빈번한 커밋/수정 허용
- `beta`
  - 핵심 플로우가 동작하고 회귀 위주 안정화 진행
  - 기능 추가보다 결함 수정/가드 강화 우선
- `stable`
  - 릴리즈 체크리스트와 운영 점검을 통과한 상태
  - 인터페이스/동작을 보수적으로 변경

권장 표기:
- `v3.0.0-alpha.N`
- `v3.0.0-beta.N`
- `v3.0.0`

참고: 앱 패키지 버전(`package.json`)은 저장소 전체 버전과 함께 관리합니다.

## 2) Train branch strategy
기본 브랜치 전략:

1. `train`(통합 열차) 브랜치에서 v3 변경을 누적 통합
2. 기능 단위 브랜치에서 작업 후 PR 생성
3. PR은 가능한 작은 단위(1 task = 1 commit)에 맞춰 train으로 병합
4. 안정화 윈도우 동안에는 train에서 결함 수정/문서/테스트 중심으로 제한
5. stable 승격 시 train 기준으로 release 커밋/태그를 생성

권장 규칙:
- v2 변경과 v3 변경을 동일 PR에 혼합하지 않음
- `.data/**`는 어떤 브랜치에서도 추적 금지

## 3) Stabilization window steps
stable 직전 안정화 윈도우는 아래 순서로 수행합니다.

1. Scope freeze
- v3 범위 외 변경 차단
- 신규 기능 투입 중단, 회귀/보안/문서 정리만 허용

2. Verification run
```bash
pnpm test
pnpm build
pnpm v3:doctor
```

3. Release checklist 검증
- `RELEASE_CHECKLIST_V3.md` 전 항목 체크
- 금지어/가드/raw/fulltext/csv 정책 재검증

4. Optional golden regression (존재 시)
```bash
pnpm test planning/v3/qa/goldenPipeline.test.ts
```

5. Handoff record
- 릴리즈 기준 커밋/검증 로그/알려진 제한사항을 PR 본문 또는 릴리즈 노트에 기록

## 4) Merge strategy (squash vs split PRs)
원칙:
- 기능 단위 변경은 리뷰/롤백 단위를 명확히 유지
- 히스토리는 추적 가능성과 복구 용이성을 우선

### 4.1 Split PRs (권장 기본)
다음 경우는 분리 PR로 진행:
- 기능 변경 + 보안 가드 변경이 함께 있는 경우
- 데이터 마이그레이션/운영 CLI가 포함되는 경우
- UI 변경과 모델 규칙 변경이 동시에 있는 경우
- 리뷰어/검증 경로가 서로 다른 경우

### 4.2 Squash merge (통합 시)
다음 조건을 만족하면 squash 병합 사용:
- 하나의 명확한 목적을 가진 PR
- 테스트/빌드/체크리스트 증빙이 PR에 포함
- 커밋 히스토리 압축이 추적성에 악영향을 주지 않는 경우

참고:
- `/ops/auto-merge` 운영 문서는 squash 병합 흐름을 기본으로 설명합니다.
- 대형 변경은 split PR + 단계적 병합 후 마지막에 train에서 안정화 검증을 수행합니다.

## 5) Required release gates for stable
stable 승격 전 최소 게이트:
- `RELEASE_CHECKLIST_V3.md` 완료
- `pnpm test` 통과
- `pnpm build` 통과
- `pnpm v3:doctor` 오류 0
- write-route guard(local-only/same-origin/CSRF) 테스트 유지

---
본 정책은 현재 저장소의 v3 운영 방식 기준으로 유지합니다.
