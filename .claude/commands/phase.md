---
description: Execution run – implement one phase from PLAN.md (e.g. /phase P2)
argument-hint: P<N> [task range]
---

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/MILESTONES.md`, `PLAN.md`, `OPEN_QUESTIONS.md`, all ADRs in `docs/adr/` and, if present, the latest report in `docs/progress/`.

Then implement **$ARGUMENTS** following **mode B (execution run)** in `docs/PLANNING_PROMPT.md`:

- Create a feature branch for the phase if you are on `main`.
- Work task by task in `PLAN.md` order. For each task: explore existing code with the code graph first (reuse before you write), implement, write tests, get `bun run check` green, tick the checkbox in `PLAN.md`, commit with `git commit -s` (Conventional Commits + task ID).
- At the end, demonstrate every phase acceptance criterion with executed commands.
- Write `docs/progress/phase-<N>.md` (done, deviations, known gaps, new risks, evidence) and stop. Don't push.
