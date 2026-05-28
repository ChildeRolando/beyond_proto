# Codex Agent Guide

This file contains Codex-specific behavior for `combat-engine`. Shared project facts live in `CLAUDE.md`.

## Required Reading

- Read `CLAUDE.md` before making project changes.
- Treat `CLAUDE.md` as the source of truth for architecture, engine conventions, route flow, role/loadout rules, test commands, Git workflow, and CHANGELOG rules.
- If this file conflicts with `CLAUDE.md`, follow `CLAUDE.md` for project facts and this file only for Codex-specific tool behavior.

## Codex Working Rules

- Start by checking `git status --short` and relevant diffs when taking over existing work.
- The worktree may contain user, Claude, or generated changes. Do not revert changes you did not make unless explicitly asked.
- If a file you need to edit already has unrelated changes, read enough context to preserve teammate intent and make the smallest compatible edit.
- Prefer existing module boundaries and local helper APIs. Do not introduce new abstractions unless they remove real complexity or match an existing pattern.
- Keep engine modules browser-independent. UI changes should stay in `index.html` unless the project has already split the relevant UI code.
- Use focused tests for the touched area first, then broaden when modifying shared engine, turn pipeline, role/loadout, UI routing, or networking behavior.

## Collaboration With Claude Code

- Keep shared facts out of this file. If project behavior changes, update `CLAUDE.md`; update `AGENTS.md` only when Codex-specific workflow changes.
- When handing work back, report changed files, tests run, commands that failed or were not applicable, and remaining risks.
- If a Claude handoff mentions pending work, verify it against the current worktree before continuing.
- For code reviews, lead with bugs, behavioral regressions, missing tests, and file/line references. Keep summaries secondary.
- For implementation tasks, carry the work through code, verification, and a concise outcome report whenever feasible.

## Command Notes

- Use `rg` / `rg --files` for search when available.
- Prefer non-interactive commands.
- Use the test commands documented in `CLAUDE.md`; remember that `test_e2e.mjs` is run with `node test_e2e.mjs`, not `npx playwright test`.
