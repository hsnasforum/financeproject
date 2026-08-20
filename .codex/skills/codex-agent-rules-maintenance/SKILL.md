---
name: codex-agent-rules-maintenance
description: Maintain repository Codex agent rules, model profiles, subagent prompts, and skill routing. Trigger when changing AGENTS.md, .codex/config.toml, .codex/agents/*.toml, multi_agent.md, multi-agent prompts, model family, reasoning effort, delegation policy, or related verification guards.
---

# Codex Agent Rules Maintenance

Use this workflow to keep persistent rules, native subagent profiles, CLI role prompts, and skill routing consistent without expanding into application behavior.

## Workflow

1. Read the newest `/work` note for today. If none exists, read the newest note from the previous day.
2. Inventory `AGENTS.md`, `.codex/config.toml`, `.codex/agents/*.toml`, `multi_agent.md`, `scripts/prompts/multi-agent/*.md`, the runner, and affected skills before editing.
3. Verify current behavior with official OpenAI model guidance, AGENTS.md, Subagents, Build skills, and config documentation. Treat third-party summaries as secondary evidence.
4. State the target model family and evaluation baseline. For GPT-5.6 migration, preserve the current reasoning effort first and compare one level lower only on representative tasks.
5. Use explicit `gpt-5.6-sol` for demanding planning, implementation, review, and synthesis roles. Use `gpt-5.6-terra` for read-heavy exploration, log analysis, supporting research, and documentation unless measured results justify another profile. Do not rely on the `gpt-5.6` alias when the active Codex account does not expose it.
6. Keep common rules in the closest shared instruction file. Put only role-specific differences in agent or role prompts, and remove repeated or conflicting instructions.
7. Replace broad brevity commands with a priority contract: preserve required facts, decisions, caveats, next actions, artifacts, and verification; trim introductions, repetition, generic reassurance, and optional background first.
8. For delegated work, define the independent scope, write permission, completion condition, return format, and whether the parent must wait for every result. Prefer read-heavy parallelism and isolate write ownership.
9. Keep skill descriptions concise and front-load trigger terms because implicit selection depends on `description` and descriptions may be shortened in the initial skill list.
10. Update operator guidance, the CLI runner, guard rules, and `/work` when their contracts change.

## Verification

- Validate each changed skill with `quick_validate.py`.
- Parse `.codex/config.toml` and every `.codex/agents/*.toml` as TOML.
- Run `bash -n scripts/run_codex_multi_agent.sh` when the runner changes.
- Run `pnpm multi-agent:guard` for agent, prompt, config, or skill changes.
- Run `git diff --check -- <changed files>`.
- Search for stale model IDs and broad brevity instructions in active agent-rule files.
- Report Codex CLI checks as unverified when the local executable cannot run; do not substitute a claimed pass.

## Boundaries

- Do not change product logic, routes, data contracts, or financial policy during an agent-rule maintenance round.
- Do not add a new rule or skill unless it owns a repeatable workflow or fixes an observed routing gap.
- Do not assume every agent needs the same model or maximum reasoning effort.
- Do not copy third-party wording into project rules; translate verified guidance into the repository's existing contracts.

## Output

- Changed rule and profile files
- Model and reasoning choices with evidence
- Skills added or updated and their trigger boundaries
- Executed checks, unexecuted checks, and residual risks
