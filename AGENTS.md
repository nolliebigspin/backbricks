# AGENTS.md

All agent instructions for this repository live in **[`CLAUDE.md`](./CLAUDE.md)**. Read it completely before doing any work; every rule and invariant there applies to you, whichever agent you are (Codex, Cursor, Gemini, …).

Quick pointers:

- Architecture: `docs/ARCHITECTURE.md` · Milestones: `docs/MILESTONES.md` · Process: `docs/PLANNING_PROMPT.md`
- Reusable task prompts: `.claude/commands/*.md` (paste their content if your agent has no slash commands)
- Code graph without MCP: `codegraph explore "<question or symbol>"` (run `mise run setup` first)
- Before pushing: `bun run check`
