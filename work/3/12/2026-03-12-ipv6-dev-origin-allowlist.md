# 2026-03-12 IPv6 dev origin allowlist 보강

## 변경 파일
- `next.config.ts`
- `tests/next-config-dev-origins.test.ts`
- `work/3/12/2026-03-12-ipv6-dev-origin-allowlist.md`

## 사용 skill
- `planning-gate-selector`
  - `next.config.ts` 변경에 맞춰 최소 검증을 `pnpm exec vitest run ...` + `pnpm build`로 좁히는 데 사용했다.
- `work-log-closeout`
  - 실제 변경 파일, 실제 실행 검증, 남은 리스크를 현재 `/work` 형식에 맞춰 정리하는 데 사용했다.

## 변경 이유
- Next.js 16.1.6 dev 서버가 `origin.hostname`을 `[::1]` 형태로 파싱해 `/_next/*` 요청의 cross-origin 허용 여부를 판정한다.
- 현재 저장소는 WSL `localhost` bridge로 `[::1]` 경로를 실제로 노출하므로, `allowedDevOrigins`가 bracketed IPv6 loopback까지 함께 허용해야 했다.

## 핵심 변경
- `next.config.ts`의 `allowedDevOrigins`에 `::1`과 `[::1]`를 함께 유지해 IPv6 loopback 표기 차이로 dev asset 요청이 차단되지 않게 했다.
- `tests/next-config-dev-origins.test.ts`를 같은 기준으로 갱신해 loopback 허용 목록 회귀를 고정했다.
- 작업 중 재확인 시 `next.config.ts`는 이미 dirty 상태에서 `[::1]`만 포함하고 있었고, 이번 라운드에서는 기존 `::1` 경로와 테스트를 함께 맞추는 최소 수정만 추가했다.

## 검증
- `pnpm exec vitest run tests/next-config-dev-origins.test.ts`
  - PASS
- `pnpm build`
  - PASS
  - `next_build_safe`가 공유 `.next` 사용 중임을 감지해 `.next-build` 격리 distDir로 우회한 뒤 production build를 완료했다.

## 남은 리스크
- 이미 실행 중인 `pnpm dev` 프로세스는 `next.config.ts` 변경을 자동 반영하지 않을 수 있으므로, 같은 오류가 남아 있으면 dev 서버 재시작이 필요하다.
- 현재 워크트리는 이번 라운드 외의 staged/unstaged 파일이 많이 섞여 있어 후속 커밋 시 이번 변경 파일만 선택적으로 확인해야 한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
