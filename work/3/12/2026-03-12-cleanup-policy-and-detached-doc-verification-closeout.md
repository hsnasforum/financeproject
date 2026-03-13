# 2026-03-12 cleanup policy and detached doc verification closeout

## 변경 파일
- `work/3/12/2026-03-12-cleanup-policy-and-detached-doc-verification-closeout.md`

## 사용 skill
- `planning-gate-selector`: cleanup helper와 운영 문서 배치에 필요한 최소 검증 세트를 고르는 데 사용.
- `work-log-closeout`: 이번 verification 라운드의 실제 실행 결과와 남은 리스크를 `/work` 형식에 맞게 정리하는 데 사용.

## 변경 이유
- 최신 `/work` 기준 남은 우선순위는 `.next-build-*` cleanup 정책과 `pnpm build:detached` 운영 규칙이 실제로 닫혔는지 확인하는 것이었다.
- 내부 검토 결과, `build:detached` 문서는 이미 `README.md`, `docs/runbook.md`, `docs/maintenance.md`에 반영돼 있었고, 실제 blocker 성격은 cleanup helper가 stale isolated build 산출물을 안전하게 다루는지 검증하는 쪽이 더 컸다.
- 따라서 이번 라운드는 코드/문서 추가 수정 없이 helper 동작과 문서 정합성을 재검증하는 verification batch로 잠갔다.

## 핵심 변경
- 코드/문서 추가 수정 없음.
- `pnpm cleanup:next-artifacts` fixture smoke로 stale `.next-build-*`, 대응 `-tsconfig.json`, standalone shadow가 실제로 정리되고 최신 isolated build만 보존되는지 확인했다.
- 같은 helper를 현재 repo에서도 실행해 active runtime이 있으면 destructive cleanup 대신 safe skip으로 멈추는지 확인했다.
- `README.md`와 `docs/maintenance.md`를 다시 읽어 cleanup 정책과 `pnpm build:detached` 운영 규칙이 이미 최신 상태인지 확인했다.

## 검증
- `node --check scripts/next_artifact_prune.mjs`
- `pnpm exec eslint scripts/next_artifact_prune.mjs`
- fixture smoke
  - `fixture=$(mktemp -d /tmp/finance-next-artifact-prune-XXXXXX) && mkdir -p "$fixture/.next-e2e-old" "$fixture/.next-host-old" "$fixture/.next-build-old" "$fixture/.next-build-keep/standalone/.next-shadow" && printf '{"distDir":".next-build-keep","updatedAt":"2026-03-12T08:00:00.000Z"}\n' > "$fixture/.next-build-info.json" && printf '{"compilerOptions":{}}\n' > "$fixture/.next-build-old-tsconfig.json" && printf '{"compilerOptions":{}}\n' > "$fixture/.next-build-keep-tsconfig.json" && pnpm cleanup:next-artifacts -- --cwd "$fixture" --allow-running --dist-dir .next-build-keep && printf 'FIXTURE=%s\n' "$fixture" && find "$fixture" -maxdepth 3 \( -type d -o -type f \) | sort`
  - PASS: `.next-build-old`, `.next-build-old-tsconfig.json`, `.next-e2e-old`, `.next-host-old`, standalone `.next-shadow` 제거 확인
  - PASS: `.next-build-keep`, `.next-build-keep-tsconfig.json`, `.next-build-info.json` 보존 확인
- `pnpm cleanup:next-artifacts`
  - PASS: 현재 repo active runtime이 있어 `root`, `root build`, `standalone` 전부 `skipped active-runtime ...`로 안전 종료
- `sed -n '70,95p' README.md`
  - PASS: `pnpm cleanup:next-artifacts`, `pnpm build:detached`, 최신 isolated build 보존 규칙 문구 확인
- `sed -n '13,45p' docs/maintenance.md`
  - PASS: final gate 전 cleanup, `pnpm build:detached` 운영 원칙 문구 확인

## 남은 리스크
- blocker 없음.
- 이번 라운드는 verification batch라 코드/문서 추가 수정이 없다. 따라서 별도 `git diff --check`, `pnpm build`, `pnpm planning:v2:prod:smoke`는 재실행하지 않았다.
- 현재 repo에는 active dev/build runtime이 남아 있어 실제 destructive cleanup을 root repo에 바로 적용하진 않았다. 운영 규칙상 final gate 직전 active runtime이 비는 시점에 single-owner로 실행하는 편이 안전하다.

## 이번 라운드 완료 항목
- `.next-build-*` cleanup 정책이 helper 수준에서 이미 구현돼 있고 fixture 기준으로 정상 동작함을 확인
- current repo에서 active runtime 존재 시 cleanup helper가 safe skip으로 멈추는 동작 확인
- `pnpm build:detached` 운영 규칙이 `README.md`, `docs/maintenance.md`, `docs/runbook.md`에 이미 반영돼 있음을 재확인

## 다음 라운드 우선순위
- active runtime이 비는 시점에 single-owner로 `pnpm cleanup:next-artifacts -> pnpm release:verify -> pnpm build` 최종 게이트 실행 여부 판단
- 다음 장시간 build 재현이 필요하면 `pnpm build:detached`를 우선 사용하고, exit json 기준으로 앱 회귀와 exec 환경 제약을 분리
- 큰 dirty worktree는 계속 기능축별 작은 batch로 분리 유지
