# Component And Code Reuse

Use reuse to preserve one meaning and one behavior, not to maximize the number of callers per abstraction.

## Search Before Creation

Search the closest ownership scope first, then expand:

1. Current feature directory.
2. `src/components/ui` for business-neutral UI primitives.
3. Other feature components, hooks, and domain modules.
4. `src/lib` and `src/stores` for genuinely cross-feature capabilities.
5. Rust modules under `src-tauri/src` for existing commands, policies, and platform adapters.

Search by more than the proposed name. Search for visible labels, event handlers, prop shapes, domain nouns, imported APIs, and equivalent calculations.

Useful commands include:

```powershell
rg "Button|Dialog|Menu" src/components
rg "domain term|visible label|api_name" src src-tauri/src
rg "export (function|const|type)|pub (fn|struct|enum)" src/components/icon-grid
```

## Reuse Decision Order

Choose the first option whose contract remains honest:

1. Reuse the existing component or function unchanged.
2. Extend it with a small explicit variant or composition point.
3. Extract a feature-local component, hook, or domain function.
4. Promote a stable feature abstraction for cross-feature use.
5. Create a new shared primitive only when no existing contract fits.

Do not reuse an abstraction when callers share appearance but not meaning, lifecycle, accessibility behavior, or change cadence.

## Extraction Rules

- Extract a repeated domain rule as soon as multiple callers must agree on its result.
- Evaluate extraction when the same semantic UI or workflow appears twice across feature boundaries.
- Require extraction by the third occurrence of the same semantic pattern unless coupling would become worse.
- Keep one-off but complex behavior in a named feature-local module when that gives it a clear owner and test surface.
- Keep a component local until its public contract can be described without feature-specific exceptions.
- Move code; do not leave duplicate implementations behind unless compatibility requires a temporary adapter.

## Shared Component Contracts

- Keep `src/components/ui` free of DesktopGo business concepts.
- Use explicit props that describe capability or state, not internal implementation steps.
- Prefer `children`, slots, and variants over many flags such as `compact`, `forSearch`, `forSettings`, and `isSpecial`.
- Avoid components with many optional props whose combinations form unrelated products.
- Forward accessibility semantics, refs, class names, disabled state, and event behavior consistently with neighboring primitives.
- Prefer the repository's established interaction libraries for dialogs, menus, popovers, selects, drag-and-drop, and other behavior with complex accessibility semantics. Do not hand-roll focus traps, roving focus, dismissal rules, or keyboard navigation when a proven project-compatible primitive exists.
- Treat adding a new UI foundation dependency as an architectural choice: inspect installed packages and neighboring patterns first, keep the wrapper business-neutral, and explain the dependency when it materially changes the project.
- Keep side effects outside presentational shared components.
- Do not make a shared component read a feature store directly.

## Hooks, Types, And Utilities

- Extract hooks for reusable React lifecycle or orchestration, not as containers for arbitrary helper functions.
- Keep pure calculations outside hooks so they can be tested without React.
- Reuse canonical domain types. Derive narrower view types rather than redefining equivalent shapes.
- Put helpers next to their owner first. Move them into `src/lib` only when multiple features use the same business-neutral contract.
- Reject generic names such as `helpers`, `common`, or `manager` when a precise domain name is available.

## Warning Signs

Reconsider the design when any of these appear:

- Copy-pasted markup with only labels or icons changed.
- The same filtering, ordering, eligibility, or transition rule in multiple views.
- A shared component imports a feature store or feature-only type.
- A new wrapper only renames props and adds no stable behavior.
- A component accepts several booleans that select unrelated layouts.
- A utility requires callers to know hidden ordering or mutation rules.
- Extraction increases the number of files but leaves responsibilities mixed.
