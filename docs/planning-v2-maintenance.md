# Planning v2 Maintenance Checklist

P97-60 완료 이후 정상 운영 전환용 점검표입니다.  
기능 추가보다 "망가지지 않게 유지"를 우선합니다.

## 운영 주기 고정

### 주간 (권장: 일요일 오전)
- [ ] `pnpm planning:v2:ops:run`
- [ ] 최근 ops 리포트(`.data/planning/ops/reports`) FAIL 유무 확인
- [ ] `/ops/assumptions`에서 latest snapshot 상태 확인

### 격주/월간
- [ ] `pnpm planning:v2:ops:run:regress`
- [ ] `pnpm planning:v2:ops:prune --keep=50`
- [ ] `pnpm planning:v2:migrate:dry` (스키마 변경 가능성 점검)

## 스냅샷 신선도 점검 (45/120일 기준)
- [ ] `staleDays > 45`: 경고로 보고 sync 필요 여부 검토
- [ ] `staleDays > 120`: critical로 보고 즉시 동기화/원인 확인
- [ ] `snapshot.missing=true`면 즉시 복구 절차 수행
- [ ] 점검 경로: `/ops/assumptions`, `/ops/assumptions/history`

## 캐시/리포트 정리
- [ ] 월간 1회 `pnpm planning:v2:ops:prune --keep=50`
- [ ] 캐시 이상 징후(급증/오염) 시 `/ops/planning-cache`에서 purge 검토
- [ ] 정리 전 복구 지점(restore point) 생성

## 회귀 실패 대응 (중요 원칙)
- [ ] `pnpm planning:v2:ops:run:regress` 실패 시 원인(diff) 먼저 분석
- [ ] 코드 수정/원인 확인 없이 baseline 업데이트 금지
- [ ] 필요 시 롤백 후 재검증
- [ ] 장애 보고는 `docs/planning-v2-bug-report-template.md` 양식 사용

## 백업/복구 절차
- [ ] 정리/마이그레이션 전 export 또는 restore point 생성
- [ ] 복구 필요 시 restore point apply 후 doctor/complete 재실행
- [ ] 복구 후 assumptions latest 및 history 정합성 확인

## 업그레이드 전후 체크

### 업그레이드 전
- [ ] `pnpm planning:v2:complete`
- [ ] restore point 생성
- [ ] 주요 문서/운영 스크립트 변경사항 확인

### 업그레이드 후
- [ ] `pnpm planning:v2:acceptance`
- [ ] `pnpm planning:v2:complete`
- [ ] 필요 시 `pnpm planning:v2:ops:run:regress`

## 로컬 알람 템플릿
- 스케줄러/OS별 실패 알림 템플릿: `docs/planning-v2-scheduler.md`
- 최소 기준:
  - [ ] ops:run 실패 시 OS 알림 또는 이벤트 로그 기록
  - [ ] 알림에 실행 시각/명령/로그 위치 포함

