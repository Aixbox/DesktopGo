# DesktopGo Commit Standard

## 1. Format

Follow Conventional Commits 1.0.0 with this repository profile:

```text
<type>[(<scope>)][!]: <中文主题>

[正文]

[Footer]
```

Examples:

```text
feat(search): 添加快捷入口使用频率排序
fix(launchpad): 修复拖拽后分组顺序丢失
refactor(tauri): 拆分全局快捷键注册逻辑
docs(commit): 完善提交信息规范
```

## 2. Atomic commits

A commit must represent one logical purpose and be independently understandable, verifiable, and revertible.

Keep together:

- implementation and its directly related tests;
- a dependency declaration and its lockfile update;
- a schema change and the migration required to use it;
- a behavior change and the documentation necessary to explain that behavior.

Split apart:

- unrelated features or defects;
- functional changes and unrelated formatting;
- refactors and behavior changes when they can be separated safely;
- dependency upgrades unrelated to the feature;
- generated artifacts that are not required by repository policy.

When multiple commits are needed, order prerequisites before dependents. Do not manufacture a split that leaves an intermediate commit broken or requires modifying user-owned changes merely to separate them.

## 3. Type selection

Choose the first matching semantic purpose, not the dominant file extension.

| Type | Use for |
| --- | --- |
| `feat` | New or expanded user-visible behavior |
| `fix` | Defect or regression correction |
| `refactor` | Internal restructuring with no intended behavior change |
| `perf` | Measurable or intentional performance improvement |
| `docs` | Documentation-only changes |
| `test` | Test-only changes |
| `build` | Dependencies, packaging, compiler, or build tooling |
| `ci` | CI/CD workflows and automation |
| `style` | Formatting-only changes with no behavior or UI-design change |
| `chore` | Repository maintenance that fits no type above |
| `revert` | Reversal of an earlier commit |

Do not use `chore` as a fallback for a clear `fix`, `refactor`, `build`, or `docs` change. UI styling that changes visible behavior belongs to `feat` or `fix`; `style` is only for source formatting.

## 4. Scope selection

Use the smallest stable feature or module name that owns the change:

1. feature/domain, such as `search`, `launchpad`, or `settings`;
2. reusable component area, such as `icon-grid`, `icon-crop`, or `ui`;
3. platform or tooling area, such as `tauri`, `build`, `ci`, or `commit`.

Rules:

- Use lowercase ASCII and kebab case: `add-icon-dialog`, not `AddIconDialog`; `image-crop`, not `imageCrop`.
- Use one scope when a primary owner is clear.
- Omit the scope only for a truly repository-wide change with no useful single owner.
- Do not list multiple scopes or use a filename merely because it changed.
- Prefer established current scopes, but normalize inconsistent legacy capitalization.

## 5. Subject rules

- Use a concise Chinese verb-object phrase that states the concrete change.
- Keep the complete header at 72 Unicode characters or fewer.
- Do not end with `。`, `.`, `！`, `!`, `？`, `?`, `；`, `;`, `：`, `:`, `，`, or `,`.
- Avoid vague subjects such as `更新代码`, `修改内容`, `修复问题`, or `优化功能`.
- Do not include implementation trivia, file lists, issue IDs, or validation results in the subject.

Good:

```text
feat(search): 支持按使用频率排序快捷入口
fix(icon-grid): 修复多选拖拽后的占位错位
build(deps): 升级图片裁剪依赖
```

Bad:

```text
update code
feat: 更新代码
fix(UI): 修复问题。
chore(search,tauri): 修改多个文件
```

## 6. Body and footers

Use a subject-only message for a small, obvious atomic change. Add a body when reviewers need context about motivation, constraints, behavior, or migration.

- Leave exactly one blank line between the header and body.
- Write the body as a Markdown bullet list. Every body line must start with `- `, one point per line. Never write the body as prose paragraphs.
- Wrap a long bullet by indenting the continuation line with two spaces.
- Explain why the change is needed and the important behavioral effect. Do not narrate every changed file.
- Keep non-code body lines at 100 Unicode characters or fewer when practical.
- Put issue references in footers, such as `Closes: #123` or `Refs: #123`.

`scripts/validate-commit-message.mjs` enforces the bullet-list body. Blank lines, footers, and fenced code blocks are the only exceptions.

Good:

```text
fix(launchpad): 修复背景图上图标名称看不清

- 蒙版浓度可调低后，主题前景色的名称在壁纸上时深时浅
- 改用白字加紧凑深色投影，与系统桌面图标一致
```

Bad — body written as a paragraph:

```text
fix(launchpad): 修复背景图上图标名称看不清

蒙版浓度可调低后，主题前景色的名称在壁纸上时深时浅，改用白字加紧凑深色投影。
```

For a breaking change, use both `!` in the header and a `BREAKING CHANGE:` footer:

```text
feat(config)!: 调整快捷入口配置结构

- 将旧版扁平配置迁移为按工作区分组的结构

BREAKING CHANGE: 现有配置需要在首次启动时迁移到 workspaceGroups。
Refs: #123
```

## 7. Pre-commit quality gate

Before each commit:

1. Confirm the staged diff is one atomic group.
2. Run repository-required checks and `git diff --check`.
3. Validate the final message with `scripts/validate-commit-message.mjs`.
4. Commit without bypassing hooks.
5. Verify the created commit subject and staged file set.
