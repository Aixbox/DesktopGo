---
name: maintain-modular-code
description: Keep DesktopGo changes modular, reusable, and maintainable. Use when implementing, fixing, refactoring, or reviewing React, TypeScript, JavaScript, or Rust code, especially when creating or modifying components, hooks, stores, domain rules, services, Tauri commands, shared utilities, or already-oversized files. Enforce reuse discovery, responsibility separation, dependency direction, file budgets, focused tests, and explicit verification.
---

# Maintain Modular Code

Apply this workflow to every code change. Optimize for clear ownership and stable boundaries, not merely fewer lines or more files.

## Project Launch Ownership

- Never start the DesktopGo application, a Tauri development process, a Vite development or preview server, a browser session, or a native application window for testing.
- Do not run `pnpm dev`, `pnpm tauri dev`, `vite`, `vite preview`, `tauri dev`, `cargo run`, or any equivalent command that launches the project or keeps a project process running.
- The user exclusively owns starting and stopping DesktopGo project processes, including processes used for runtime and visual verification.
- Verify changes with unit tests, linting, builds, static inspection, and runtime evidence supplied by the user.
- If verification requires launching DesktopGo or one of its servers, report that limitation and ask the user to run it.
- Inspect an already-running DesktopGo instance only when the user explicitly requests it; never restart, replace, or stop the user's process as part of ordinary verification.

## 1. Inspect Before Designing

- Read repository instructions and the relevant neighboring modules.
- Measure every file likely to change. Treat an oversized file as refactoring pressure, not permission to add more responsibilities.
- Search before creating a component, hook, helper, type, store action, domain rule, service, or Rust module. Use `rg` by name, behavior, visible copy, props, and imported APIs.
- Identify the change's responsibilities: rendering, interaction orchestration, domain policy, state ownership, persistence, IPC, or platform integration.
- Read [references/component-reuse.md](references/component-reuse.md) whenever UI, hooks, shared types, or utilities are involved.
- Read [references/architecture-boundaries.md](references/architecture-boundaries.md) whenever a change crosses modules, stores, IPC, persistence, or platform code.

## 2. Choose Boundaries Before Editing

- Keep one primary reason to change per module.
- Keep views focused on rendering and user interaction.
- Put React lifecycle and workflow coordination in hooks or feature controllers.
- Put deterministic business decisions and transformations in pure domain modules.
- Put storage, network, Tauri IPC, filesystem, and operating-system access behind services or adapters.
- Keep shared state minimal. Derive values instead of duplicating them in stores.
- Preserve dependency direction; never make a lower-level or shared module import a feature view to save time.
- Prefer a small cohesive extraction made for the current behavior over a speculative framework.

Before adding a new abstraction, state internally:

1. What existing candidates were inspected?
2. Is the behavior semantically the same or only visually similar?
3. Where should ownership live?
4. Does extraction reduce conceptual duplication or only move lines?

## 3. Implement With Reuse Discipline

- Prefer an existing primitive or feature component when its contract already matches.
- Prefer composition, slots, and explicit variants over copied markup or boolean-prop matrices.
- Keep feature-specific components with their feature. Promote them to shared code only after the contract is stable and consumers cross feature boundaries.
- Extract repeated domain rules immediately; do not allow separate components to encode competing versions of the same policy.
- Avoid pass-through wrappers, generic `utils` dumping grounds, barrel files that hide cycles, and catch-all manager modules.
- Preserve behavior while extracting from legacy files. Make the smallest coherent structural change needed for the requested work.
- Do not mix an unrelated broad refactor into a feature or bug fix.

## 4. Respect Quality Budgets

Use these review thresholds unless generated code or an explicitly documented exception applies:

| Measure                  |           Threshold |
| ------------------------ | ------------------: |
| New `.ts` / `.js` file   | 1000 physical lines |
| New `.tsx` / `.jsx` file | 1000 physical lines |
| New `.rs` file           |  500 physical lines |
| Function or hook         |            80 lines |
| Cyclomatic complexity    |                  15 |
| Nesting depth            |                   4 |
| Parameters               |                   5 |

- Do not grow a changed legacy file that already exceeds its file threshold. Extract at least the responsibility affected by the change when practical.
- Do not split cohesive code solely to satisfy a number. Treat a threshold failure as a prompt to improve responsibilities and APIs.
- Run `node .codex/skills/maintain-modular-code/scripts/check-changed-files.mjs` from the repository root before completion.
- For comparison with a branch or commit, pass `--base <ref>`.
- Read [references/quality-gates.md](references/quality-gates.md) for testing, resilience, accessibility, internationalization, performance, and exception rules.

## 5. Verify In Proportion to Risk

- Run the narrowest relevant tests first, then project lint and type checking for shared or cross-module changes.
- Add or update tests for extracted domain policies, state transitions, data conversions, and bug regressions.
- Exercise loading, empty, failure, cancellation, and retry behavior when asynchronous code changes.
- Check keyboard and focus behavior when interactive UI changes.
- Inspect the final diff for duplicated logic, accidental public APIs, dependency inversions, and unrelated churn.

## 6. Report Architectural Impact

Summarize only material decisions:

- State which existing modules were reused or why a new abstraction was necessary.
- Name new modules and their single responsibility.
- Call out any threshold exception or remaining legacy debt.
- Report the exact validation commands run and any checks not run.
