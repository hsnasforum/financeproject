# 2026-10-19 Finance 빌드 출력 완료 판정

## 변경 파일
- `scripts/next_build_safe.mjs`: 자식 stdio 종료 뒤 최종 검사·영수증 발급, 자식 신호 종료 전달.
- `.github/workflows/ci.yml`: Ubuntu verify의 기존 build tools에 ripgrep 추가.
- `tests/next-build-output-completion.test.ts`: 실제 wrapper와 disposable fakeNext를 사용하는 12개 회귀.
- 이 기록. 이전 139/140 기록과 원시 실패 자료는 수정하지 않았습니다.

## 사용 skill
- systematic-debugging, test-driven-development, verification-before-completion: 실제 wrapper의 수정 전후 동작과 종료 상태를 확인했습니다.
- work-log-closeout: 이 마일스톤의 사실과 아직 실행하지 않은 검사를 구분합니다.

## 변경 이유
Node child exit 시점에는 상속된 stdout/stderr pipe가 열려 있을 수 있습니다. 실제 wrapper와 유한 수명의 합성 후손 프로세스로 직접 자식 종료 뒤 경고가 오는 조건을 재현했습니다. 기존 CI 실패의 원인이라는 주장은 하지 않습니다. 1d04의 필수 CI 통과는 기존 완료 사실로 유지합니다.

## 핵심 변경
exit는 childExited 수명만 기록하고 close에서 최종 출력 검출·privacy audit·receipt를 처리합니다. 실제 자식 SIGTERM 회귀에서 기존 자체 신호 핸들러로 0 종료가 관측되어, 이미 있는 relayParentSignal로 신호를 재전달합니다. nonzero·부모 취소·OS spawn 실패와 Next 진입점 해결 실패도 확인합니다.
privacy gate, snapshot9, Windows dependency 정규화, readonly source metadata hardlink/출력 single-link 규칙을 변경하지 않습니다. CI advisory의 지위나 단언·필수 검사를 바꾸지 않습니다.

## 검증
기록 시점은 후속 commit 전입니다. 새 HEAD 원본 빌드·런타임·artifact·push 결과는 `tmp/finance-build-output-close-20261019/FINAL-RESULT.json`과 `REPORT.md`로 이어집니다.
- Node 22.22.2/pnpm 9.15.9, 독립 node_modules의 기존 fresh에서 실행했습니다. 원본 Vitest/fullsuite/release:verify는 실행하지 않았습니다.
- `pnpm exec vitest run tests/next-build-output-completion.test.ts`: 최종 fixture와 기존 1d04 wrapper는 5실패/7통과 exit1(`10-final-before.log`). 늦은 stdout·stderr 경고에서 code0/receipt:true, 늦은 일반/nonzero 출력 누락, 자식 신호 0 종료를 확인했습니다.
- 수정 후 위 테스트 포함 관련 6파일: 75통과/기존 플랫폼 전용 2skip, exit0(`11-final-affected.log`). wrapper 회귀 12개는 모두 통과했습니다.
- `pnpm planning:ssot:check`: 실제 rg guard PASS, 5파일/11테스트 통과 exit0(`07-planning-ssot.log`).
- 변경 파일 ESLint와 격리 tsc는 최종 exit0(`11b-final-eslint.log`, `11c-final-isolated-types.log`). 최초 fixture 문자열 오류와 NODE_ENV 타입 오류의 원시 실패도 보존했습니다.
- 추가 직접 소비 계약 2파일은 47개 통과 exit0(`11e-adjacent-contracts.log`). 합계 관련 8파일 122통과/기존 2skip이며 SSOT 11개는 별도입니다.
- 원본 정식 build/typecheck/Playwright tsc, 25개 필수 실제 브라우저 단언·source restart, 새 HEAD artifact/설치/managed 2회, 민감값 비출력 귀속·보호·freshness는 이 cutoff에서는 아직 미실행입니다. 이 문서의 과거 통과를 새 HEAD의 완료 증거로 대신하지 않습니다.

## 남은 리스크
최신 원격 CI와 비작성자 독립 review는 마스터의 후속 확인 대상입니다. 이번 Windows 실행은 로컬에서 하지 않았습니다. 이전 전체 .next raw scanner FAIL과 legacy dev/cache 잔존은 그대로 유지하며 새 분배 대상과 구분합니다. 개인 DB/env/원본 자료와 기존 사용자 변경을 stage하지 않습니다.

## 다음 라운드
승인된 정확 4경로의 일반 후속 commit 뒤 그 HEAD를 정식 검증하고, 모든 로컬 필수 조건 통과·원격 drift 없음일 때만 동일 브랜치로 normal push합니다. 새 PR/merge/deploy나 공식 데이터 재수집은 하지 않습니다.
