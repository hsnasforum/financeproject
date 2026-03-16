# Planning v2 Changelog (P97-0 ~ P97-99)

## 2026-03-16 Release Notes Prep (v1.0.4)

- 패키지 버전과 Planning v2 릴리즈 스크립트의 `--version` 파라미터를 `1.0.4`로 동기화했습니다.
- `docs/release-notes.md` 최신 항목과 `docs/releases/planning-v2-1.0.4.md`를 추가해 이번 후속 릴리즈의 사용자 영향과 운영 메모를 정리했습니다.
- 공식 public UI의 밝은 톤 정리 마감, 한글 copy 정리, 계산 근거 오버레이 개선, 플래닝 입력 폭 수정, `analysis_docs` 정비 완료를 `v1.0.4` 변경 범위로 묶었습니다.

## 2026-03-02 Release Prep (v1.0.3)

- 릴리즈 준비: 버전 갱신 및 스크립트 버전 파라미터 동기화.
- CI required gates 기준 고정: `pnpm test` + `pnpm planning:v2:complete` + `pnpm planning:v2:compat`.
- 본 섹션의 세부 변경사항/릴리즈 요약은 배포 직전에 보강합니다.
## 2026-03-02 Baseline Release (v1.0.2)

- P97-131: Compatibility CI
  - legacy storage/backups fixture(`v1_plain_storage`, `v2_encrypted_storage`, `backup_v1.zip`) 추가
  - compat runner(`planning:v2:compat`)로 migration->gate 경로 검증
  - CI required gate에 compat 단계 추가
- P97-132: Baseline release 정리
  - 버전 상향(`1.0.2`) 및 릴리즈 노트 추가
  - planningPolicy/opsPolicy 기본값 동결 문서를 최신 기본값으로 갱신
  - required CI gate를 `pnpm test` + `pnpm planning:v2:complete` + `pnpm planning:v2:compat`로 고정
  - migration note(APR legacy 정규화, liabilityId strict validation) 재확인

## 2026-03-01 Release Checkpoint (v1.0.1)

- P97-97: UX/A11y polish
  - 공통 상태 컴포넌트(`LoadingState`, `ErrorState`, `EmptyState`)를 `/planning`, `/planning/reports`, `/ops` 흐름에 적용
  - `ko-KR` 기반 숫자 포맷 일관화(KRW, %, 개월)
  - 핵심 버튼/토글/행동 요소에 접근성 라벨(aria) 보강
- P97-98: Golden fixtures + deterministic replay
  - GOOD/CAUTION/RISK 포함 canonical fixture 5종 추가
  - Monte Carlo 랜덤성 제거(골든 런은 MC 비활성)로 회귀 안정화
  - Playwright full suite에 golden run report contract 검증 추가
- P97-99: v2 release checkpoint
  - 버전 상향(`1.0.1`) 및 릴리즈 노트 추가
  - planningPolicy/opsPolicy 기본값 동결 문서화
  - CI required gate를 `pnpm test` + `pnpm planning:v2:complete`로 명시
  - 업그레이드 노트(APR legacy 정규화, liabilityId strict validation) 고정

1. P97-0: Profile v2, deterministic monthly engine, warning/explainability, 기본 테스트 세트 구축.
2. P97-1~2: assumptions snapshot fetch/sync/storage + OPS 동기화 + audit/backup 연동.
3. P97-3: `/api/planning/v2/simulate` 도입, snapshot 자동 주입, debug viewer 연결.
4. P97-4: multi-scenario API(base/conservative/aggressive) + diff(why) 요약 추가.
5. P97-5: 경량 Monte Carlo(seed 재현) + 확률/퍼센타일 지표/API 확장.
6. P97-6: Action Plan 생성기 + finlife 후보 비교(권유 단정 금지) + actions API.
7. P97-7: profile/run 파일 저장소 + `/planning`, `/planning/runs` 사용자 플로우 구축.
8. P97-8: regression corpus/baseline/허용오차 게이트 + 리포트 + CI 연결.
9. P97-9~10: assumptions health(ack gate) + 캐시 키/TTL + 계산 예산 guardrail.
10. P97-11~12: ECOS 금리 스냅샷 확장 + snapshot history/diff/rollback/replay 지원.
11. P97-13~14: 생애주기 cashflow events + debt strategy/refi/what-if 수학 비교 모듈.
12. P97-15~17: planning UX 완성, OPS planning 대시보드, backup/integrity doctor 마감.
13. P97-18~20: 사용자/운영/아키텍처 문서, demo seed, offline+HTTP smoke, release checklist.
14. P97-21: 에러/메시지/ReasonCode 표준화, 한국어 i18n, API 응답 형식 정리, 테스트 안정화.
15. P97-22: debug 라우트 기본 비활성+로컬 제한, 라우트 가드 스캔 추가, env/문서/RC 스모크 최종 점검.
16. P97-23~25: 운영 단일 실행/조건부 snapshot sync/report 보관 + 스케줄러 템플릿 + retention cleanup(OPS dry-run/confirm) 완성.
17. P97-26: Done Definition 고정, planning 플래그 단일 진입점(config) 정리, HTTP acceptance 스크립트 및 one-page 요약 문서 추가.
