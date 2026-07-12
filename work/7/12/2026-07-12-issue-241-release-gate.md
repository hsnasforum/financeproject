# 2026-07-12 Issue #241 tag release 검증·provenance 게이트

## 변경 파일

- `.github/workflows/release.yml`
- `scripts/release_tag_guard.mjs`
- `scripts/release_artifact_provenance.mjs`
- `scripts/release_existing_release_guard.mjs`
- `tests/release-tag-guard.test.ts`
- `tests/release-artifact-provenance.test.ts`
- `tests/release-existing-release-guard.test.ts`
- `tests/release-workflow-contract.test.ts`
- `README.md`
- `RELEASE_CHECKLIST.md`
- `docs/release.md`
- `work/7/12/2026-07-12-issue-241-release-gate.md`

## 사용 skill

- `finance-skill-routing`: Issue #241에 필요한 최소 local skill 범위를 선택했습니다.
- `planning-gate-selector`: release workflow·artifact·운영 문서 변경에 필요한 focused test, lint, typecheck, build, verify, release gate를 선택했습니다.
- `work-log-closeout`: 실제 실행 결과와 blocker, 운영상 후속 결정을 표준 `/work` 형식으로 정리했습니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/241
- 기준 main: `5c831932634556cc3b807ca69e4e8bb31b626e6d`
- 작업 브랜치: `codex/241-release-gate-provenance`
- 기존 tag release는 required verification과 독립적으로 GitHub Release를 만들 수 있었고, source SHA·artifact checksum·file inventory·toolchain을 하나의 machine-readable 계약으로 연결하지 않았습니다.
- release 실패 시 asset 생성 금지, tag/main/source 일치, 최소 권한, immutable verified bundle 전달을 fail-closed로 묶어야 했습니다.

## 핵심 변경

- tag·`package.json` version·checkout SHA·로컬/원격 tag target·원격 기본 브랜치 ancestry와 clean source input을 단계별로 다시 검증합니다.
- `pnpm release:verify` 뒤 한 번만 desktop artifact를 빌드하고, archive·inventory·manifest를 provenance script가 직접 생성합니다.
- manifest는 source SHA, tag/package version, Node·pnpm·platform·arch, desktop manifest·lockfile·artifact checksum, archive·inventory checksum·size·file count를 기록합니다.
- runtime 필수 manifest와 nonempty server/static payload, symlink/FIFO 등 unsupported entry, manifest/lockfile inventory hash drift를 fail-closed로 차단합니다.
- publish job만 `contents: write`를 가지며, 원격 tag와 다운로드 bundle을 재검증하고 기존 GitHub Release의 자동 덮어쓰기를 금지합니다. 모든 action은 검증한 commit SHA로 고정했습니다.
- public API·응답 shape·stored user data·DB schema/query·cache/revalidation·migration에는 영향이 없습니다. 새 계약은 GitHub Release workflow와 release artifact manifest schema version 1에 한정됩니다.

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/release-tag-guard.test.ts tests/release-artifact-provenance.test.ts tests/release-existing-release-guard.test.ts tests/release-workflow-contract.test.ts tests/quality-gates-registry.test.ts --reporter=dot`: PASS, 5 files / 24 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm typecheck`: PASS
- 변경 script/test targeted ESLint: PASS
- 세 release script `node --check`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm verify`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages
- 6개 GitHub Action tag를 `git ls-remote`로 대조: PASS, annotated tag 2개는 peeled commit SHA로 교체
- 보안 reviewer 최종 확인: 추가 P0/P1 없음, runtime completeness·hash 연결·filesystem entry·action pin 보강 확인
- `corepack pnpm multi-agent:guard`: PASS, latest work note tracked 확인
- `git diff --cached --check`: PASS
- `DATABASE_URL=file:./prisma/dev.db node scripts/planning_v2_desktop_build.mjs --no-next-build`: BLOCKED, raw `.next/standalone`의 pnpm 내부 symlink에서 fail-closed. 기존 Issue #223과 같은 원인으로 unsafe artifact와 Release asset은 생성되지 않음
- `DATABASE_URL=file:./prisma/release.db corepack pnpm release:verify`: BLOCKED, planning fast E2E 등 선행 gate 통과 후 final full test의 `tests/desktop-artifact-provenance.test.ts` 2건이 같은 raw standalone symlink 때문에 실패
- 실제 tag push와 GitHub Release 생성은 실행하지 않았습니다.

## 남은 리스크

- [운영 결정 필요] tag push는 태그가 가리키는 historical workflow를 실행할 수 있습니다. hardening 이전 commit에 새 tag를 만들면 과거 workflow가 재실행될 수 있으므로, GitHub ruleset에서 `v*` tag 생성자를 release owner로 제한하고 과거 commit tag 생성을 금지해야 합니다. 코드만으로는 기존 git history의 workflow를 바꿀 수 없습니다.
- [blocked: #223] pnpm 10 raw standalone 내부 symlink 정책이 해결되기 전 실제 desktop build와 tag release는 안전하게 중단됩니다. release workflow에서 symlink를 임의 materialize하거나 검사 우회를 추가하지 않았습니다.
- GitHub Actions runner/billing 실패는 code failure와 분리해 확인해야 합니다. 실제 PR Actions가 step 시작 전 실패하면 한 번 재시도한 뒤 infrastructure failure로 기록합니다.
- rollback은 release workflow·세 guard/provenance script·테스트·문서를 함께 되돌립니다. 검증 없는 자동 release로 복귀하지 않으며, 문제가 있으면 verified artifact의 수동 승인 발행으로 축소합니다.

## 다음 라운드 우선순위

1. Issue #242 public proxy caller별 rate limit을 현재 main에서 재확인합니다.
2. Issue #223의 pnpm 10 standalone symlink 정책이 합의되면 desktop build와 release gate를 다시 실행합니다.
3. release 전 GitHub `v*` protected tag/ruleset과 과거 commit tag 금지 정책을 운영자가 설정합니다.
