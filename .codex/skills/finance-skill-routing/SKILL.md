---
name: finance-skill-routing
description: Choose the smallest useful set of Finance repository skills for the current task. Use when routing skills or changing skill activation.
---

# Finance Skill Routing

Start from the current user goal and touched surface. Do not load a skill merely because it exists.

- Verification scope is unclear: use planning-gate-selector.
- A user-visible milestone is closing: use work-log-closeout.
- AGENTS.md, Codex config, agents, model or effort, runner, guard, rules, prompts, or skill routing changes: use codex-agent-rules-maintenance.
- Route, DART/data-source, or planning-v3 specialist skills apply only when that domain is actually touched.

Read only the selected skill and the files it explicitly requires. When no repository-specific procedure is needed, use no skill.

Return the selected skills and one-line reasons. Record only skills actually used in the milestone note.
