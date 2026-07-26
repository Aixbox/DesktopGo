---
name: task-branch-lifecycle
description: Run a feature, fix, or modification in a temporary local Git branch, then pause for user review and later return the changes to the original branch and remove the temporary branch after explicit approval. Invoke explicitly for isolated task work; do not use implicitly for ordinary requests.
---

# Task Branch Lifecycle

Use this skill only when explicitly invoked as `$task-branch-lifecycle` (or selected from the skill picker). It manages a temporary branch in the current checkout; it does not create a Git worktree and it never pushes to a remote.

## Phase Detection

Determine the phase from the current conversation and Git state:

- **Start**: no active task branch has been recorded for this task.
- **Review waiting**: implementation is complete and the user has not explicitly approved cleanup.
- **Cleanup**: the user explicitly says the review passed and asks to finish, clean up, return, or remove the task branch.
- If the user requests changes during review, remain on the task branch and return to implementation. Do not clean up.

Keep these values in the conversation and report them at phase boundaries:

- original branch
- temporary task branch
- whether changes are committed or uncommitted
- validation commands and results

If the conversation is resumed without this state, inspect Git and ask before deleting or switching anything. Never infer the original branch from guesswork.

## Start Phase

1. Inspect the repository before changing branches:

   ```powershell
   git rev-parse --show-toplevel
   git branch --show-current
   git status --short
   git diff --check
   ```

2. Stop and ask the user to commit or stash existing changes if the working tree is dirty, if the current HEAD is detached, or if Git reports an in-progress merge, rebase, cherry-pick, or revert. Do not auto-stash, reset, clean, or discard changes.

3. Record the current branch as `original_branch`. Derive a short, lowercase, hyphenated task slug and create a local-only branch using the project-safe `codex/` prefix:

   ```powershell
   git switch -c codex/<kind>-<slug>
   ```

   Use `feat` for additions, `fix` for bug fixes, and `change` or `refactor` for modifications. If the branch already exists locally or remotely, choose a different slug; never reset or reuse it silently.

4. Implement the requested task on the temporary branch. Follow the repository's other applicable skills, especially modularity, testing, and validation guidance. Keep unrelated changes out of the branch.

5. Run focused tests first, then broader checks appropriate to the change. Do not start the DesktopGo application or dev server unless the user explicitly requests runtime testing and owns that process.

6. Before reporting completion, inspect `git status`, `git diff --stat`, `git diff --check`, and the final branch name. Do not automatically commit or push. If the user explicitly requested a commit, use the repository's commit skill; note that cleanup must then merge or otherwise preserve that commit before deleting the task branch.

## Review Waiting Phase

Report:

- the temporary branch and original branch
- files or behavior changed
- validation commands and results
- whether changes are uncommitted or committed
- the exact next action: user review, followed by an explicit cleanup instruction

Then stop. Do not switch branches, delete the task branch, commit, push, merge, rebase, or discard changes while waiting.

Treat phrases such as “检查通过”, “可以清理”, “合并回原分支并删除”, or an equivalent explicit approval as cleanup approval. “继续修改”, “这里有问题”, or new task requirements mean remain on the task branch.

## Cleanup Phase

Only after explicit approval:

1. Confirm the current branch is the recorded temporary branch and inspect the working tree again. If there are unexpected files, conflicts, or an in-progress Git operation, stop and report them.

2. Preserve the implementation when returning to `original_branch`:

   - If changes are uncommitted, switch back with `git switch <original_branch>` only when Git can carry the changes without conflict.
   - If the task branch contains commits, switch to the original branch and first run `git merge --ff-only <task_branch>`. This is the default integration path because it preserves the reviewed commit IDs without rewriting history. If fast-forward is impossible because the original branch advanced, stop and report the situation; use a regular merge or rebase only after the user chooses.

3. Verify the current branch is `original_branch`, verify the intended changes are still present, and only then remove the temporary branch with the non-forcing command:

   ```powershell
   git branch -d codex/<kind>-<slug>
   ```

   Do not use `-D` unless the user explicitly authorizes discarding commits and the consequences are clearly reported.

4. Confirm that no remote branch was created or deleted. The original branch should contain the reviewed changes, normally as uncommitted changes ready for the user's normal commit workflow unless the user requested a commit.

## Safety Rules

- This is a local branch workflow, not a Worktree workflow.
- Never push, create a pull request, force-push, reset, clean, stash, or delete user changes without an explicit request.
- Never delete the temporary branch before confirming the changes survived on the original branch.
- Prefer fast-forward merge over rebase during cleanup. Rebase is allowed only when the user explicitly requests a linear history and the task branch has not been shared.
- If switching back is blocked by conflicts or new work on the original branch, stop and ask; do not force the switch.
- If the user wants to abandon the task, ask whether to preserve the uncommitted changes on the original branch or explicitly discard them. Discarding requires a separate explicit confirmation.
