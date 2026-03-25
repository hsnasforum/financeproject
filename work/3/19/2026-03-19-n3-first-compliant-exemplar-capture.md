# 2026-03-19 N3 first compliant exemplar capture

## 변경 파일
- `docs/release.md`
- `docs/release-checklist.md`
- `work/3/19/2026-03-19-n3-first-compliant-exemplar-capture.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 audit/docs-only로 유지하고 `git diff --check`만 실행하는 최소 검증 세트를 유지했다.
- `work-log-closeout`: first compliant exemplar 존재 여부, 문서 보정, 미실행 검증을 `/work` 형식으로 정리했다.

## 변경 이유
- 직전 backlog audit에서 current exemplar와 shortlist candidate는 정리됐지만, current quality gate 기준으로 완전 준수 tracked exemplar가 실제로 있는지와, 없을 경우 future first compliant exemplar를 어떤 조건에서 캡처할지는 아직 문서에 직접 잠겨 있지 않았다.
- 이번 라운드는 historical note를 다시 쓰지 않고 adoption 상태만 명시해, 이후 새 release closeout note가 나타날 때 무엇이 first compliant exemplar인지 판단 기준을 바로 적용할 수 있게 만드는 것이 목적이었다.

## 핵심 변경
- shortlist note 4개(`v1.0.4 main verify`, `runtime release-verify smoke`, `single-owner final gate closeout`, `release verify preflight closeout`)를 current `Tracked Release Note Quality Gate` 기준으로 다시 대조했다.
- 결론은 `no fully compliant exemplar yet`이다.
  - 기존 note들은 역할 적합성은 높지만, current template가 요구하는 `대상 릴리즈`, `primary / companion final gate`, `conditional minor guard`, `advisory record`, `evidence 위치`, `미실행 gate` 같은 필수 섹션을 같은 순서로 모두 갖추지는 않았다.
- `docs/release.md`에는 compliant exemplar adoption status를 추가해 현재 legacy exemplar는 참고용 기준선으로 유지하고, first compliant exemplar는 future capture 대상으로만 다루도록 정리했다.
- 같은 문서에는 future first compliant exemplar capture 조건을 추가했다.
  - tracked `/work` note
  - current template 섹션 순서 완전 준수
  - 빈 섹션도 `- 없음` 또는 미실행 이유로 유지
  - blocker / advisory / evidence 분리
  - raw evidence path-only
  - actual command/path/result consistency
- `docs/release-checklist.md`에는 `advisory record`, `evidence 위치`, `미실행 gate` 섹션이 비어도 생략하지 않는다는 점과, 새 note가 first compliant exemplar capture 후보가 되는 조건을 짧게 추가했다.

## 판단 결과
- fully compliant exemplar
  - 아직 없음
- current exemplar 유지
  - success exemplar: `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - blocker/smoke exemplar: `work/3/13/2026-03-13-runtime-release-verify-smoke.md`
- 유지 이유
  - current template 완전 준수 예시는 아니지만, success형과 blocker/smoke형 역할 reference로는 여전히 가장 읽기 쉽다.
- future capture 원칙
  - first compliant exemplar가 생겨도 legacy exemplar를 즉시 교체하지 않고, template adoption 기준선으로 먼저 사용한다.
  - success형/blocked형 legacy exemplar 교체는 이후 역할 적합성까지 더 나은 compliant note가 생겼을 때 다시 판단한다.

## 검증
- 실행한 검증
- `git diff --check -- docs/release.md docs/release-checklist.md docs/maintenance.md work/3/19/2026-03-19-n3-first-compliant-exemplar-capture.md`
  - 결과: 통과
- 미실행 검증
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- 이유: 이번 라운드는 audit/docs-only라 사용자 지시대로 `git diff --check`만 실행했다.

## 남은 리스크
- first compliant exemplar가 아직 없으므로, 실제로 current template를 완전 준수한 새 tracked release closeout note가 등장하기 전까지는 legacy exemplar와 adoption 기준을 함께 해석해야 한다.
- 이번 라운드는 shortlist 4개만 다시 판단한 것이므로, 더 오래된 release closeout note까지 넓히는 대규모 audit은 범위 밖으로 남겼다.
- 현재 워크트리에는 unrelated dirty 변경이 남아 있으므로, 실제 커밋/PR에서는 이번 docs-only 범위를 분리해 확인해야 한다.

## 다음 라운드 우선순위
- `N3 first compliant release closeout capture on next stable release-bound run`
