---
name: commit
description: Review the current Git working tree, create a focused commit with a clear message, and optionally push it when explicitly requested. Use when the user asks to commit, submit, or push current code, or invokes $commit.
---

# Commit Changes

## Overview

Safely turn the changes relevant to the current task into one focused Git commit. Preserve unrelated user work, validate the staged diff before committing, and treat pushing as a separate opt-in action.

## Workflow

### 1. Inspect the repository

- Run `git status --short`, `git branch --show-current`, and inspect `git diff` plus `git diff --stat`.
- Inspect relevant untracked files before deciding whether they belong in the commit. Check `git diff --cached` too.
- Read applicable `AGENTS.md` guidance and the project's documented lint, typecheck, and test commands.
- If there are no changes, stop and report that there is nothing to commit.

### 2. Define the commit scope

- Include only files related to the user's current request. Preserve unrelated modifications and do not reset, clean, stash, or discard them.
- Never use broad staging such as `git add -A` or `git add .`; stage explicit paths after reviewing them.
- Do not stage likely secrets, credentials, local environment files, build output, or generated artifacts unless the user explicitly asks for them.
- If the working tree contains multiple unrelated changes and the scope is ambiguous, ask the user which files or changes to commit instead of guessing.

### 3. Validate

- Run the smallest relevant checks required by repository guidance. At minimum, run `git diff --check` before staging.
- If checks fail, stop before committing and report the failing command and useful error context.
- Do not hide failures by weakening tests, bypassing hooks, or changing unrelated files.

### 4. Prepare and create the commit

- Derive a concise imperative commit subject from the actual diff. Follow the repository's existing commit convention when one is evident; otherwise keep the subject specific and at most 72 characters.
- Stage only the selected paths, then inspect `git diff --cached --stat` and `git diff --cached`.
- Create the commit with `git commit -m "<subject>"` only after the staged diff matches the requested scope.
- Never amend an existing commit, rewrite history, or force-push unless the user explicitly requests that exact operation.
- After committing, report the commit hash, subject, files included, and checks run.

### 5. Push only when explicitly requested

- Treat words such as "push", "推送", or "提代码" as an explicit request to push. A plain commit request must not push.
- Before pushing, verify the current branch, configured remote, and upstream. Do not push from a detached HEAD.
- Use the normal upstream push command; never use `--force` or `--force-with-lease` unless explicitly requested.
- If no upstream is configured, show the intended remote and branch and ask before setting one with `git push -u`.
- If the push is rejected or requires authentication, stop and report the exact failure without retrying destructively.

## Safety rules

- Do not run `git reset --hard`, `git clean`, checkout-based discard commands, or equivalent destructive operations.
- Do not commit when merge or rebase conflicts are present; report the conflicted paths and stop.
- Respect hooks and approval prompts. If a hook modifies files, re-inspect the status and staged diff before proceeding.
- Keep the final response short and include whether a push occurred.
