---
name: work-log-closeout
description: Create or update a Finance Project /work closeout note after a change. Trigger when implementation or verification is done and you need a Korean handoff note with changed files, executed checks, residual risks, and next-step context.
---

# Work Log Closeout

Use this skill to write a repository-consistent `/work/<month>/<day>/YYYY-MM-DD-<slug>.md` note after a round of changes.

## Inputs

- Actual changed files
- Actual commands that were run
- Real pass/fail or blocked outcomes
- Remaining risks, gaps, and next steps
- Skill names that were actually used in the round, if any

## Required workflow

1. Gather only executed facts.
   - today's folder path: `work/<month>/<day>/`
   - create the folder first if it does not exist
   - read the newest note in today's folder before writing
   - if there is no note for today, read the newest note from the previous day
   - changed files
   - commands actually run
   - outcomes actually observed
2. Keep the note in Korean unless an external convention requires English.
3. Use a short slug tied to the work theme.
4. If route, verification policy, security rule, or operator flow changed, mention related docs updated or still pending.
5. Never claim an unrun test or build was completed.
6. Always keep a short `사용 skill` section. If skills were used, list each name and why it mattered; otherwise write `- 없음`.

## Recommended structure

- 제목: `# YYYY-MM-DD <작업명>`
- `## 변경 파일`
- `## 사용 skill` (always include; write `- 없음` when no skill was used)
- `## 변경 이유`
- `## 핵심 변경`
- `## 검증`
- `## 남은 리스크`

## Writing rules

- Prefer concrete facts over long narrative
- Keep `핵심 변경` to about 3 to 6 flat bullets
- Include exact commands in `검증`
- Include only skills that were actually used, not merely available in the session
- Keep the `## 사용 skill` section even when no skill was used, and write `- 없음`
- If something is blocked, mark it clearly and say why
- If the change affects docs/current-screens, release gates, or ops rules, say so explicitly

## Minimal checklist

- Are the changed files named?
- Are used skills named only when they were actually used?
- Are the reasons tied to the user-visible or operator-visible problem?
- Are all listed commands actually executed?
- Are residual risks honest and specific?
- Can the next worker continue from this note without rereading the full chat?

## Output format

- completed note content only when the user asks for the file body
- otherwise: filename suggestion under `work/<month>/<day>/`, summary bullets, and missing facts still needed
