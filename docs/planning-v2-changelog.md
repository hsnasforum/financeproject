# Planning v2 Changelog (P97-0 ~ P97-26)

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
