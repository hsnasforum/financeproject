# Planning Backlog (Post-v2 Freeze)

## 목적
- v2 동결 이후 요청을 일관되게 분류하고, 우선순위/작업 규칙을 고정합니다.
- 원칙: v2는 안정화 중심, 신규 기능은 v3로만 확장합니다.

## A) 분류 기준

### 1) Bug (v2 허용)
- 크래시/오작동
- 잘못된 계산 결과
- 단위 오류(`%`, `원`, `개월` 등)
- 민감정보 노출(로그/API/리포트/export)
- 보안/가드 누락(local-only, same-origin, csrf 등)

### 2) Improvement (v2 조건부)
- UI 문구/레이블/가독성 개선
- 성능 개선(예: 캐시 효율, 렌더 비용 절감)
- 리포트 정리(요약/표현 개선)  
- 조건: 사용자 행동/계약(API/저장 포맷/핵심 계산 로직) 변경이 없어야 함

### 3) New Feature (v3)
- 계좌연동/마이데이터
- 정밀 세금/연금 고도화
- optimizer 정식 기능화
- 멀티유저/암호화 기본 탑재
- 신규 데이터 소스 대규모 확장

## A-1) 큐 분리 (운영 규칙)

### v2 bugfix 큐
- 대상: 크래시/계산오류/단위오류/누출/가드 누락
- 조건: 기존 계약(API/DTO/핵심 UX) 유지
- 필수 게이트: `planning:v2:complete`, (core 변경 시) `planning:v2:regress`

### v3 feature 큐
- 대상: 신규 기능/모델/연동/아키텍처 확장
- 조건: v2 코어 수정으로 우회 구현 금지
- 참조 문서: `docs/planning-v3-kickoff.md`

## B) 우선순위 규칙 (간소 RICE)
- `Impact` (사용자 영향): 1~5
- `Risk` (오류/사고 가능성): 1~5
- `Effort` (작업량): 1~5
- `Score = (Impact + Risk) / Effort`

운영 규칙:
- 점수가 높은 항목 우선
- 동일 점수면 `Risk` 높은 항목 우선
- 릴리즈 직전에는 Bug > Improvement > New Feature 순서 유지

## C) 작업 규칙

### v2 변경 (Bug / Improvement)
- `pnpm planning:v2:complete` 필수
- v2 core 변경이면 `pnpm planning:v2:regress` 필수
- freeze 가드 확인: `pnpm planning:v2:freeze:guard`

### v3 신규 (New Feature)
- 별도 문서/브랜치/모듈에서 진행
- v2 안정화 범위에 역주입 금지
- v2 데이터 마이그레이션 경로는 유지 (`P97-33` 기준)

## D) 이슈 템플릿 (복붙)

```md
## 분류
- Type: Bug | Improvement | New Feature(v3)
- Priority Score: (Impact + Risk) / Effort = (? + ?) / ? = ?

## 증상
- 

## 재현 단계
1. 
2. 
3. 

## 데이터 문맥
- snapshotRef: id/asOf/fetchedAt/missing
- runId: (있으면)

## 기대 결과
- 

## 실제 결과
- 

## 게이트 결과
- planning:v2:complete: PASS/FAIL
- planning:v2:regress: PASS/FAIL (core 변경 시 필수)
- acceptance: PASS/FAIL (필요 시)
```

## 적용 메모
- v2는 bugfix/경미 개선만 허용합니다.
- 신규 기능 요청은 backlog에서 즉시 v3로 분리합니다.

## 라벨 정책
- v2: `v2-bug`, `v2-improve`
- v3: `v3-epic`, `v3-feature`, `v3-research`
