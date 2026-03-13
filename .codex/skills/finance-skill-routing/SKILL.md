---
name: finance-skill-routing
description: Choose the default and conditional local skills for Finance Project work. Trigger when a task asks which skills to use, when updating .codex/config.toml, or when aligning a new batch with recent /work usage patterns.
---

# Finance Skill Routing

Use this skill to choose the smallest useful set of local repository skills before a Finance Project round.

## Inputs

- Intended change scope or actual changed files
- Whether the round is implementation, verification, or analysis only
- Whether the task touches routes, hrefs, redirects, DART, data-source settings, env, freshness, or fallback behavior
- Latest `/work` note when recent usage patterns matter

## Default selection

For implementation or verification rounds, start with:

- `planning-gate-selector`
- `work-log-closeout`

## Add conditionally

- `route-ssot-check`
  - add when routes, hrefs, redirects, navigation, middleware route guards, or `docs/current-screens.md` change
- `dart-data-source-hardening`
  - add when DART, public/open data, data-source settings, env, freshness, fallback, or partial-failure handling change

## Usually not needed

- `skill-creator`
  - use only when creating or updating a skill
- `skill-installer`
  - use only when installing external or curated skills

## Workflow

1. Read the newest `/work` note for today. If none exists, read the newest note from the previous day.
2. Decide whether the task is an implementation/verification round or an analysis-only round.
3. For implementation or verification, attach the default pair first.
4. Add conditional skills only when the touched surface clearly matches their trigger.
5. Keep the final set minimal; do not add a skill just because it is available.
6. Record only actually used skills in the `/work` closeout.

## Output

- `상시 필요 스킬`
- `조건부 필요 스킬`
- `이번 라운드에서 실제로 붙일 조합`
