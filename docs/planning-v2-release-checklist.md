# Planning v2 Release Checklist

## Release Ops (P97-138)
- [ ] `pnpm release:prepare -- --version=x.y.z` (버전 bump + changelog 스텁 갱신)
- [ ] `pnpm release:verify` (CI 필수 게이트 단축 실행: `pnpm test` + `pnpm planning:v2:complete` + `pnpm planning:v2:compat`)
- [ ] 루트 [`RELEASE_CHECKLIST.md`](../RELEASE_CHECKLIST.md) 단계와 CI 게이트 정합성 확인

## 자동 체크
- [ ] `pnpm test`
- [ ] `pnpm planning:v2:regress`
- [ ] `pnpm planning:v2:smoke`
- [ ] `pnpm planning:v2:guard`
- [ ] `pnpm planning:v2:freeze:guard`
- [ ] `pnpm planning:v2:scan:guards`
- [ ] `pnpm planning:v2:seed`
- [ ] `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:smoke:http`
- [ ] `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:acceptance`
- [ ] `pnpm planning:v2:release:notes`
- [ ] `pnpm planning:v2:release:evidence`
- [ ] `pnpm planning:v2:release`
- [ ] `pnpm planning:v2:release:local` (서버 실행 후)
- [ ] `pnpm planning:v2:final-report`
- [ ] `pnpm planning:v2:record`

## 완성 확인 (3단계)
- [ ] `pnpm planning:v2:complete`
- [ ] 서버 실행 후 `pnpm planning:v2:acceptance`
- [ ] `docs/planning-v2-5min-selftest.md` 체크 항목 1회 완료
- [ ] `docs/planning-v2-policy-defaults.md` 기준으로 기본 정책값(Planning/Ops) 변경 없음 확인

## CI Required Gates
- [ ] `pnpm test` PASS
- [ ] `pnpm planning:v2:complete` PASS
- [ ] `pnpm planning:v2:compat` PASS

## Version / Tag
- [ ] `package.json` 버전 업데이트 (예: `1.0.2`)
- [ ] 릴리즈 노트 생성: `docs/releases/planning-v2-{version}.md`
- [ ] Git 태그 생성/푸시: `git tag v{version}` + `git push origin v{version}`

## 수동 체크
- [ ] `/planning`에서 프로필 선택 후 `Run plan`(simulate + scenarios) 실행
- [ ] `/planning`에서 `Save run` 저장 후 `/planning/runs`에서 2개 run 비교
- [ ] health critical 발생 시 ack 체크 전 저장/고비용 액션 제한 동작 확인
- [ ] `PLANNING_DEBUG_ENABLED=false` 기본값에서 `/debug/*` 비노출(404) 확인
- [ ] `PLANNING_DEBUG_ENABLED=true` + localhost 요청에서만 `/debug/*` 접근 가능 확인
- [ ] `/ops/assumptions`에서 snapshot 상태 확인 및 `Sync now` 동작 확인
- [ ] `/ops/planning`에서 cache 상태 확인 및 `Purge expired` 동작 확인
- [ ] backup export/import 후 `pnpm planning:v2:doctor -- --strict` 실행

## 금지사항 확인
- [ ] UI/문서에 단정 추천(가입 강요/정답 표현) 문구 없음
- [ ] API 응답에 키/토큰/내부 경로(`.data/...`) 누출 없음
- [ ] finlife 후보는 비교 정보(목적/기간/금리 범위) 중심으로만 표시

## Freeze 정책 확인
- [ ] v2 동결 이후 신규 기능 추가는 v3 트랙(문서/브랜치)에서만 진행
- [ ] v2 코어 변경 시 `pnpm planning:v2:complete` + `pnpm planning:v2:regress` 실행 완료
- [ ] baseline 업데이트 시 승인(confirm) 기록 확인
- [ ] completion record(`.data/planning/release/V2_COMPLETION_RECORD.json`)는 동일 버전에서 덮어쓰지 않고, 새 버전에서만 갱신

## 실패 시 조치
- 자동 체크 실패 시 baseline/코드/환경을 구분해 원인 기록 후 재실행
- `planning:v2:guard` 실패 시 민감 문자열 제거 후 재검증
- `planning:v2:smoke:http` 실패 시 endpoint/status/error code를 우선 확인

## Rollback (backup + migration state)
1. `/ops/backup`에서 최신 백업 파일을 확보합니다.
2. 장애 시 직전 안정 버전으로 롤백 후 백업을 `replace` 모드로 복원합니다.
3. migration 상태를 확인합니다.
   - `.data/planning/migrations/migrationState.json`
   - `/ops/doctor` migration 카드
4. 필요 시 migration 보정:
   - `pnpm planning:v2:migrate:dry`
   - `pnpm planning:v2:migrate:apply`
5. 복구 확인:
   - `pnpm release:verify`

## Upgrade Notes (v2)
- legacy APR 입력값 `0 < x <= 1`은 percent로 정규화(`x * 100`)됩니다.
- canonical profile에서는 `debts[].aprPct`, `offers[].newAprPct`를 percent 단위로 사용합니다.
- `offers[].liabilityId`는 `debts[].id`와 정확히 일치해야 하며, 불일치 시 검증이 차단됩니다.
