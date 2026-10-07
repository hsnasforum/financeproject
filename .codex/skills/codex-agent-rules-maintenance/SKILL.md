---
name: codex-agent-rules-maintenance
description: Maintain Finance Codex instructions, model routing, agents, skills, rules, prompts, runner, and guard without changing product behavior.
---

# Codex Agent Rules Maintenance

Use only for the harness surfaces named in the description.

Preserve product, data, auth/owner, backup/restore, runtime, Git, and external-action safety contracts. Keep root instructions small; put role ownership and verification in multi_agent.md, and keep each custom agent narrow.

When model or routing changes, align only the affected surfaces:
- .codex/config.toml and relevant .codex/agents/*.toml
- CLI runner/prompts when they have independent defaults
- scripts/multi_agent_handoff_guard.mjs when it validates those defaults
- .codex/rules/*.rules for command review policy
- historical docs only when active/default wording would become misleading

Validate the changed surface, not the whole app:
- parse or strict-check Codex config
- quick_validate.py for changed skills
- node --check scripts/multi_agent_handoff_guard.mjs when changed
- bash -n scripts/run_codex_multi_agent.sh when changed
- codex execpolicy check for changed rules
- corepack pnpm multi-agent:guard
- git diff --check and scope review

Do not add new skills or agents unless an observed repeated task needs them. Do not treat a .rules prompt as an absolute sandbox security boundary.
