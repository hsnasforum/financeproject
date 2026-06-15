# 2026-05-25 data freshness copy alignment

## 변경 파일
- `src/components/data/DataFreshnessBanner.tsx`
- `tests/data-freshness-banner-copy.test.tsx`
- `work/5/25/2026-05-25-data-freshness-copy-alignment.md`

## 사용 skill
- `dart-data-source-hardening`: 데이터 최신성, stale 감지, 스모크 업데이트 안내가 실제 동작과 어긋나지 않는지 점검했습니다.
- `planning-gate-selector`: UI 문구, 데이터 소스 설정 흐름, build 영향에 맞춰 focused test, lint, typecheck, e2e:data-sources, build를 선택했습니다.
- `work-log-closeout`: 실제 실행한 검증과 남은 upstream 리스크를 `/work`에 기록했습니다.

## 변경 이유
- `DataFreshnessBanner`는 토글이 켜진 경우 세션당 1회 자동 스모크 업데이트를 시도할 수 있습니다.
- 기존 문구는 “자동 동기화는 수행하지 않으며”라고 단정해 실제 동작과 충돌했습니다.
- stale 상태는 사용자 판단에 민감하므로, 자동 수행 가능성과 세션 제한 조건을 정확히 노출해야 합니다.

## 핵심 변경
- freshness banner 안내 문구를 “자동 스모크 업데이트는 토글이 켜진 경우 세션당 1회만 시도합니다.”로 바꿨습니다.
- 문구가 다시 “자동 동기화는 수행하지”로 회귀하지 않도록 렌더 테스트를 추가했습니다.
- 데이터 조회, 동기화 API 호출, stale 판정 로직은 변경하지 않았습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- src/components/data/DataFreshnessBanner.tsx tests/data-freshness-banner-copy.test.tsx` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm test tests/data-freshness-banner-copy.test.tsx` 통과: 1 test
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec eslint src/components/data/DataFreshnessBanner.tsx tests/data-freshness-banner-copy.test.tsx` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec tsc --noEmit` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm e2e:rc:data-sources` 통과: 1 passed
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm build` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm verify` 통과: 656 files, 2019 tests

## 남은 리스크
- `docs/data-freshness-report.md`는 여전히 `total=8, stale=8` 상태입니다. 이번 라운드는 사용자 문구 정합성만 다뤘고 스냅샷 자체를 갱신하지 않았습니다.
- data-source e2e 로그에 `housing:sales` upstream 404가 계속 남습니다. 화면 흐름은 통과하지만 외부 공공데이터 가용성 또는 fallback 안내는 별도 점검 대상입니다.
- WSL 환경에서 `[next_dev_safe] Windows localhost bridge disabled: spawn powershell.exe ENOENT` 경고가 반복됩니다. WSL 내부 브라우저 테스트에는 영향이 없었지만 Windows 브리지 사용 시 별도 확인이 필요합니다.

## 다음 라운드
- stale snapshot 8건을 실제로 갱신할 수 있는지, 아니면 stale 상태를 운영 안내로 남겨야 하는지 구분합니다.
- `housing:sales` 404가 테스트 fixture/외부 API 경로/서비스키 상태 중 어디에서 오는지 분리합니다.
- `package.json`의 기존 dependency 및 스크립트 변경 범위를 stage 단위로 정리합니다.
