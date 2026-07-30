---
name: commit
description: Review the Git working tree, split changes into atomic commits, create validated Conventional Commit messages using repository scopes and Chinese subjects, commit safely, and optionally push when explicitly requested. Use when the user asks to commit, submit, or push code, or invokes $commit.
---

# Commit Changes

Create safe, reviewable Git commits that follow the repository's Conventional Commits profile. Preserve unrelated work and make each commit independently understandable and revertible.

## Required standard

- Read [references/commit-standard.md](references/commit-standard.md) before planning commits or composing messages.
- Apply it to every commit created by this skill.

## Workflow

### 1. Inspect

- Run `git status --short`, `git branch --show-current`, `git diff --stat`, `git diff`, and `git diff --cached`.
- Inspect relevant untracked files before including them. Read applicable `AGENTS.md` files and project validation commands.
- Check recent subjects with `git log -20 --pretty=format:"%s"` to reuse established scopes without copying legacy formatting mistakes.
- Stop if there are no changes, unresolved conflicts, an in-progress merge/rebase that the user did not ask to finish, or a detached HEAD.

### 2. Plan atomic commits

- Group changes by one user-visible behavior, defect, refactor, or maintenance purpose. A commit must be independently understandable, verifiable, and safely revertible.
- Keep implementation with its directly related tests, types, documentation, migrations, and lockfile changes.
- Separate unrelated features, fixes, refactors, formatting, dependency upgrades, and generated artifacts.
- If multiple clean groups exist and the user did not require one commit, create multiple commits in dependency order.
- Ask only when ownership is ambiguous or splitting would require editing user changes. Never reset, clean, stash, discard, or rewrite unrelated work.

### 3. Validate changes

- Run the smallest relevant lint, typecheck, test, or build commands required by repository guidance.
- Run `git diff --check` before staging.
- Stop before committing when validation fails. Report the command and useful error context; do not bypass hooks or weaken tests.

### 4. Stage one group

- Stage explicit paths only. Never use `git add .`, `git add -A`, or another broad staging command.
- Inspect `git diff --cached --stat` and `git diff --cached` after staging.
- Confirm the staged diff contains exactly one planned group and contains no secrets, credentials, environment files, unrelated edits, or accidental generated output.

### 5. Compose and validate the message

- Derive `type`, `scope`, subject, body, and footers from the staged diff, not only from the user's wording.
- Write the body as a Markdown bullet list — every body line starts with `- `, one point per line. Never use prose paragraphs; the validator rejects them.
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

- Report each commit hash and subject.
- Report the files or logical group included in each commit.
- Report the validation commands run and their results.
- State whether a push occurred.
