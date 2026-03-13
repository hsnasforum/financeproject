# 2026-03-12 dev guard shortcut follow-up closeout

## 변경 파일
- `src/components/DevUnlockShortcutLink.tsx`
- `src/components/OpsPlanningCacheClient.tsx`
- `tests/dev-unlock-shortcut.test.ts`
- `work/3/12/2026-03-12-dev-guard-shortcut-followup-closeout.md`

## 사용 skill
- `planning-gate-selector`: 공통 helper와 ops cache 경고 카드 변경에 맞는 최소 검증 세트를 `vitest + eslint + build`로 좁히는 데 사용.
- `work-log-closeout`: 이번 follow-up의 실제 변경, 실행한 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 직전 dev unlock shortcut 정리 뒤에도 공통 helper는 순수 `CSRF`, `동일 origin`, `로컬 환경` 가드 문구를 놓칠 수 있었다.
- 그 결과 `ErrorState`를 쓰는 표면에서 `/ops/rules` 복구 링크가 빠질 수 있었고, `OpsPlanningCacheClient`처럼 raw 오류 카드를 쓰는 경로는 같은 helper 개선 혜택도 받지 못했다.
- 반대로 `Vault CSRF`처럼 다른 보안 문맥은 `/ops/rules`로 보내면 안 되므로, helper가 dev guard 문맥만 더 정확히 잡아야 했다.

## 핵심 변경
- `src/components/DevUnlockShortcutLink.tsx`의 `isDevUnlockCsrfMessage`를 보강해 `CSRF`, `동일 origin`, `로컬 환경`, `localhost/local only` 문구도 dev guard 복구 대상으로 인식하게 했다.
- 같은 helper는 `vault` 문맥은 제외하도록 해 `Vault CSRF`류 메시지가 `/ops/rules` 바로가기를 잘못 띄우지 않게 했다.
- `tests/dev-unlock-shortcut.test.ts`에 pure CSRF/origin/local guard 문구와 `Vault CSRF` 예외를 추가하고, `ErrorState`가 실제로 `/ops/rules 바로가기`를 렌더하는지 정적 마크업 회귀를 넣었다.
- `src/components/OpsPlanningCacheClient.tsx`는 `errorFixHref`가 없더라도 dev guard 메시지면 같은 helper로 `/ops/rules 바로가기`를 붙이도록 맞췄다.

## 검증
- `pnpm exec vitest run tests/dev-unlock-shortcut.test.ts`
- `pnpm exec eslint src/components/DevUnlockShortcutLink.tsx src/components/ui/ErrorState.tsx tests/dev-unlock-shortcut.test.ts`
- `pnpm exec eslint src/components/DevUnlockShortcutLink.tsx src/components/ui/ErrorState.tsx src/components/OpsPlanningCacheClient.tsx tests/dev-unlock-shortcut.test.ts`
- `pnpm build`
- `pnpm multi-agent:guard`

## 남은 리스크
- blocker 없음.
- 아직 raw Dev unlock/CSRF 경고를 자체 텍스트로만 보여주는 표면이 일부 남아 있다. 현재 확인된 후보는 `RulesOpsClient`, `FeedbackDetailClient`, `AutoMergePolicyClient`, `OpsPlanningFeedbackClient`, `StickyAgendaBar`, `AutoMergeClient`, `LabelingClient`다.
- 큰 dirty worktree는 그대로라, 다음 follow-up도 이 helper 재사용 축만 따로 묶는 편이 안전하다.

## 다음 라운드 우선순위
- `AutoMergePolicyClient`, `OpsPlanningFeedbackClient`처럼 운영자가 직접 누르는 표면부터 같은 helper 재사용 여부를 점검
- `FeedbackDetailClient`, `StickyAgendaBar`, `LabelingClient`처럼 메시지 상태를 직접 관리하는 컴포넌트에 공통 shortcut을 붙일지 판단
- raw 문구 대신 공통 `ErrorState` 또는 helper 조합으로 수렴할 수 있는 범위를 더 좁게 분리
