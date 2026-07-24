# Quality Gates

Apply gates in proportion to risk. A small copy correction does not need integration tests; a shared policy or IPC contract does.

## Structural Gates

- Keep new `.ts` and `.js` files at or below 400 physical lines.
- Keep new `.tsx`, `.jsx`, and `.rs` files at or below 500 physical lines.
- Do not increase the physical line count of a changed legacy file already over its threshold.
- Keep functions and hooks near 80 lines or less, complexity near 15 or less, nesting at 4 levels or less, and parameters at 5 or fewer.
- Split by responsibility and ownership. Never satisfy a limit by creating arbitrary `part1` or `helpers2` files.
- Treat generated, vendored, schema-derived, and migration artifacts as exceptions only when their origin is evident.

Run the file gate from the repository root:

```powershell
node .codex/skills/maintain-modular-code/scripts/check-changed-files.mjs
node .codex/skills/maintain-modular-code/scripts/check-changed-files.mjs --base origin/main
```

Use `--all` only for a debt inventory; the current repository contains legacy oversized files and a full scan is expected to report them.

Use the relevant project checks after the narrowest feature tests:

```powershell
pnpm.cmd lint
pnpm.cmd exec tsc --noEmit
pnpm.cmd test
cargo check --manifest-path src-tauri/Cargo.toml
```

Run both frontend and Rust checks when changing an IPC contract. Do not claim a check passed unless it was actually run.

## Tests

- Add regression coverage for bug fixes when the affected behavior can be isolated.
- Test pure domain rules with table-driven boundary cases.
- Test state transitions and invariants rather than implementation details.
- Test adapters with controlled boundaries; do not make unit tests depend on live network, filesystem, registry, shell, or AI services.
- Update both sides of an IPC contract and test serialization-sensitive changes.
- Keep extracted logic covered at its new owner rather than relying only on a large component test.

## Resilience

- Represent loading, empty, success, failure, cancellation, and stale-result behavior where applicable.
- Preserve the last valid state when a recoverable refresh fails unless product behavior says otherwise.
- Provide actionable error context without leaking secrets, tokens, private paths, or untrusted payloads.
- Clean up timers, subscriptions, observers, event listeners, object URLs, and in-flight work.
- Validate persisted and external data before it reaches domain logic.

## UI Quality

- Reuse existing UI primitives and tokens before adding styles or controls.
- Preserve keyboard navigation, visible focus, labels, roles, disabled semantics, and focus restoration for dialogs and menus.
- Put user-facing strings through the existing internationalization mechanism.
- Check long translations, narrow layouts, empty collections, and large data sets.
- Avoid render-time side effects and unstable keys.
- Add memoization only after identifying meaningful repeated work or identity-sensitive consumers.

## Security And Platform Safety

- Treat URLs, paths, shell arguments, AI output, clipboard data, persisted data, and IPC payloads as untrusted inputs.
- Prefer structured APIs and argument arrays over command-string construction.
- Keep secrets out of logs, errors, fixtures, and frontend state.
- Preserve least privilege in Tauri capabilities and platform commands.

## Exception Protocol

Use an exception only when the requested behavior cannot be delivered safely within the gate:

1. Explain why the threshold or boundary is unsuitable for this case.
2. Keep the exception scoped to one file or operation.
3. Record the measurable debt and avoid unrelated growth.
4. Obtain user approval when the exception materially increases long-term maintenance or security risk.
5. Report the exception in the final handoff.
