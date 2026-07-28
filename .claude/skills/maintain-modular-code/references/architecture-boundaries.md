# Architecture Boundaries

Use these boundaries for new work and incremental refactors. Do not reorganize unrelated legacy code merely to match the target structure.

## Frontend Dependency Direction

Prefer this flow:

```text
views/components -> hooks/controllers -> domain
                        |
                        v
                 services/adapters -> Tauri IPC / browser APIs / storage

stores -> domain types and pure policies
```

Dependencies may point right or down in this model. Domain modules must not import React, components, stores, Tauri APIs, browser globals, persistence, or platform adapters.

### Ownership

- `src/components/ui`: business-neutral visual and interaction primitives.
- `src/components/<feature>/views`: feature rendering and direct user events.
- `src/components/<feature>/hooks`: React lifecycle and feature workflow coordination.
- `src/components/<feature>/domain`: deterministic rules, geometry, policies, and transformations.
- `src/components/<feature>/services`: persistence and integration owned by one feature.
- `src/stores`: state that truly spans views or features; keep actions cohesive.
- `src/lib`: stable cross-feature capabilities and external-system adapters, not leftover code.

Keep feature-specific code within the feature directory. Promote it only after multiple features depend on the same stable contract.

## State Ownership

- Keep transient interaction state in the nearest component or hook.
- Put cross-view durable state in a store only when multiple owners require it.
- Compute derived state from canonical state; do not synchronize duplicate representations with effects.
- Keep persistence serialization at an adapter boundary.
- Model multi-step interactions with explicit transitions when boolean combinations can become invalid.
- Avoid store actions that combine unrelated features or perform hidden platform I/O.

## Tauri And Rust Boundaries

Prefer this flow for backend changes:

```text
Tauri command handlers -> application operation -> domain policy
                                  |
                                  v
                         platform/integration adapter
```

- Keep command handlers thin: validate and translate input, call an operation, and map the result.
- Keep domain decisions independent of Tauri handles, window objects, filesystem paths, registry APIs, shell commands, and network clients.
- Isolate Windows-specific behavior and other platform integrations behind focused modules.
- Return typed, actionable errors across IPC. Do not expose sensitive raw errors or silently convert failure into success.
- Avoid a central `lib.rs` or `commands.rs` accumulating full implementations; use them to declare modules and wire commands.

## Cross-Boundary Contracts

- Define one canonical request and response shape for each IPC capability.
- Validate data at trust boundaries, including persisted data and AI/network responses.
- Keep naming and optionality aligned across TypeScript and Rust.
- Add compatibility handling deliberately when stored or serialized formats change.
- Avoid importing internal implementation types across feature boundaries; expose the smallest stable contract.

## Refactoring Legacy Modules

- Identify the responsibility touched by the requested change.
- Extract that responsibility with its tests and a narrow interface.
- Leave temporary delegation in the legacy module when a full migration is outside scope.
- Prevent new callers from depending on the legacy implementation.
- Avoid simultaneous renaming, formatting, and behavior changes that make the diff hard to verify.
