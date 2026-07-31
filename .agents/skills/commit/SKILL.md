---
name: commit
description: Inspect Git changes, run a bounded runnable-project and 1000-line preflight, split changes into atomic commits, write validated Conventional Commit messages using repository scopes and Chinese subjects, create the commits, and optionally push when explicitly requested. Use when the user asks to commit, submit, or push code, or invokes $commit. This skill does not review implementation correctness or run the full development validation suite.
---

# Commit Changes

Create accurate, atomic Git commits that follow the repository's Conventional Commits profile. Preserve unrelated work and make each commit independently understandable and revertible.

## Required standard

Read [references/commit-standard.md](references/commit-standard.md) before planning commits or composing messages. Apply it to every commit created by this skill.

## Workflow

### 1. Inspect

- Run `git status --short`, `git branch --show-current`, `git diff --stat`, `git diff`, and `git diff --cached`.
- Inspect relevant untracked files before including them. Read applicable `AGENTS.md` files.
- Check recent subjects with `git log -20 --pretty=format:"%s"` to reuse established scopes without copying legacy formatting mistakes.
- Stop if there are no changes, unresolved conflicts, an in-progress merge/rebase that the user did not ask to finish, or a detached HEAD.
- Read diffs only to identify each change's purpose, ownership, dependencies, and suitable commit message. Do not perform a code review or judge implementation correctness.

### 2. Plan atomic commits

- Group changes by one user-visible behavior, defect, refactor, or maintenance purpose. A commit must be independently understandable, verifiable, and safely revertible.
- Keep implementation with its directly related tests, types, documentation, migrations, and lockfile changes.
- Separate unrelated features, fixes, refactors, formatting, dependency upgrades, and generated artifacts.
- If multiple clean groups exist and the user did not require one commit, create multiple commits in dependency order.
- Ask only when ownership is ambiguous or splitting would require editing user changes. Never reset, clean, stash, discard, or rewrite unrelated work.

### 3. Run the bounded preflight once

- Run the preflight once for the complete working-tree change set, before staging the first group. Do not repeat it for every atomic commit.
- Start these commands in parallel from the repository root:

  ```text
  pnpm build
  pnpm rust:check
  node .codex/skills/maintain-modular-code/scripts/check-changed-files.mjs
  ```

- Treat successful `pnpm build` and `pnpm rust:check` as the bounded evidence that the frontend and Tauri backend remain buildable. Do not start the long-lived `pnpm dev` or `pnpm tauri dev` processes.
- The changed-files script enforces the 1000-line limit for changed and untracked `.js`, `.jsx`, `.ts`, `.tsx`, and `.rs` files. Existing oversized files may shrink but must not grow.
- Cap the entire parallel preflight at 180 seconds. On timeout, stop the commands and report the timeout; do not keep the user waiting or silently continue to commit.
- If sandbox process restrictions cause `spawn EPERM`, retry the affected command once with the required execution permission while keeping the same 180-second overall deadline. Do not retry other failures.
- Stop before staging when any command fails. Report the command and concise error context.
- Do not run tests, standalone lint or typecheck, clippy, release builds, formatting checks, `git diff --check`, or independent code review. Do not edit source files to fix or improve the implementation.
- Commit-message validation remains required because it verifies the deliverable of this workflow.

### 4. Stage one group

- Stage explicit paths only. Never use `git add .`, `git add -A`, or another broad staging command.
- Inspect `git diff --cached --stat` and `git diff --cached` after staging.
- Confirm the staged diff contains exactly one planned group and matches the purpose expressed by the planned commit message.
- Do not use the staged-diff inspection as an implementation review or validation step.

### 5. Compose and validate the message

- Derive `type`, `scope`, subject, body, and footers from the staged diff, not only from the user's wording.
- For a subject-only message, run:

  ```text
  node <skill-dir>/scripts/validate-commit-message.mjs "<message>"
  ```

- For a multiline message, save it as a temporary UTF-8 text file and run:

  ```text
  node <skill-dir>/scripts/validate-commit-message.mjs --file <message-file>
  ```

- Fix every reported violation and rerun the validator. Do not call `git commit` until it passes.

### 6. Commit and verify

- Use `git commit -m "<subject>"` for a subject-only commit or `git commit -F <message-file>` for a validated multiline message.
- Respect Git hooks. If a hook changes files, re-inspect the working tree and staged diff before continuing.
- Verify the result with `git show --stat --oneline --summary HEAD` and record the commit hash.
- Repeat staging, message validation, and committing for each planned atomic group.
- Never amend, rebase, rewrite history, or force-push unless the user explicitly requests that exact operation.

### 7. Push only when explicitly requested

- Treat `push`, `推送`, or `提代码` as an explicit push request. A plain commit request must not push.
- Verify the current branch, remote, and upstream before pushing. Never force-push by default.
- If no upstream exists, show the intended remote and branch and ask before running `git push -u`.
- Stop and report authentication errors or rejected pushes without destructive retries.

## Final report

Report each commit hash and subject, the files or logical group included, the three preflight results and elapsed time, and whether a push occurred. State that full development validation and implementation review were intentionally not run by this skill.
