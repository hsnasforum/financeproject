# Planning v2 Release Checklist

## 자동 체크
- [ ] `pnpm test`
- [ ] `pnpm planning:v2:regress`
- [ ] `pnpm planning:v2:smoke`
- [ ] `pnpm planning:v2:guard`
- [ ] `pnpm planning:v2:scan:guards`
- [ ] `pnpm planning:v2:seed`
- [ ] `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:smoke:http`
- [ ] `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:acceptance`
- [ ] `pnpm planning:v2:release:notes`
- [ ] `pnpm planning:v2:release:evidence`
- [ ] `pnpm planning:v2:release`
- [ ] `pnpm planning:v2:release:local` (서버 실행 후)
- [ ] `pnpm planning:v2:final-report`

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

## 실패 시 조치
- 자동 체크 실패 시 baseline/코드/환경을 구분해 원인 기록 후 재실행
- `planning:v2:guard` 실패 시 민감 문자열 제거 후 재검증
- `planning:v2:smoke:http` 실패 시 endpoint/status/error code를 우선 확인
