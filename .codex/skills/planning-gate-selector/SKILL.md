---
name: planning-gate-selector
description: Choose risk-proportional Finance verification for development, milestone, or release work without duplicating broad gates.
---

# Planning Gate Selector

Use multi_agent.md의 검증 게이트 단일 기준 as the source of truth.

1. Identify the changed delta, direct consumers, and real risk: UI, calculation, auth/owner, storage/restore, external data, runtime, or harness.
2. Choose the current stage: development, milestone, or release.
3. Start with the smallest test that can actually fail for this change.
4. Expand only when the changed dependency boundary is wider than the targeted check can prove.
5. Reuse a prior successful expensive check only when source, dependencies, inputs, environment, and artifact remain valid.
6. Report executed checks, failures, and unexecuted risk separately. Never turn a targeted PASS into an app-wide or release PASS.

Do not weaken assertions, guards, fixtures, or snapshots to make the check pass. Shared DB, port, build, E2E, and release artifacts remain single-owner work.
