# Cleanup PRD: Architecture and Reliability Hardening

- Document Status: Active
- Last Updated: 2026-02-22
- Owner: Engineering
- Execution Agent: Ralph loop (`tasks/ralph-loop-cleanup.sh`)

## Context
This repository has a validated set of architectural and reliability cleanup items discovered during a review on 2026-02-22. The goal is to execute these items incrementally with tight scope control.

## Goal
Improve maintainability, correctness, and resilience across setup/scheduling flows without broad refactors.

## Non-Goals
- No product-scope expansion.
- No design-system overhaul.
- No migrations unrelated to listed cleanup items.

## Status Legend
- `TODO`: not started
- `IN_PROGRESS`: currently being implemented
- `BLOCKED`: cannot proceed due to external dependency or decision
- `DONE`: accepted criteria met

## Definition of Done
- Task status is `DONE`.
- Acceptance criteria for that task are met.
- Any required validation for changed code is run.
- Progress Log has an entry.

## Status Board
| Status | Count |
|---|---:|
| TODO | 11 |
| IN_PROGRESS | 0 |
| BLOCKED | 1 |
| DONE | 5 |

## Backlog
| ID | Priority | Title | Status | Dependencies |
|---|---:|---|---|---|
| CLN-01 | P3 | Remove vestigial `App.tsx` indirection | DONE | - |
| CLN-02 | P0 | Split `useSetupModel` God hook | TODO | CLN-01 |
| CLN-03 | P0 | Centralize app auth computation | DONE | - |
| CLN-04 | P0 | Remove derived-state reset effect in `AppointmentManager` | DONE | - |
| CLN-05 | P0 | Remove prop-to-state sync effects for snapshot key | TODO | CLN-10 |
| CLN-06 | P2 | Replace latest-ref callback pattern with `useEffectEvent` strategy | TODO | - |
| CLN-07 | P0 | Add timeout/error path to auth wait guard | DONE | - |
| CLN-08 | P0 | Fix stale `availabilityNowUtcMs` ref behavior | DONE | - |
| CLN-09 | P2 | Introduce Suspense boundaries for query-driven screens | TODO | CLN-10 |
| CLN-10 | P1 | Add `/app/setup` loader prefetching | TODO | - |
| CLN-11 | P2 | Move appointment form to a form library pattern | TODO | CLN-04 |
| CLN-12 | P2 | Add feature-level error boundaries | TODO | - |
| CLN-13 | P1 | Remove `null as unknown as QueryClient` context lie | TODO | - |
| CLN-14 | P3 | Unify paginated data layer when adapter supports it | BLOCKED | external package support |
| CLN-15 | P3 | Test mutation pending states in UI tests | TODO | - |
| CLN-16 | P3 | Replace raw Tailwind class constants with component/CVA pattern | TODO | - |
| CLN-17 | P3 | Remove root `shared/` dumping-ground pattern | TODO | - |

## Task Details

### CLN-01: Remove vestigial `App.tsx` indirection
- Status: DONE
- Problem: Extra re-export layers (`src/App.tsx`, `workspace.tsx`) add no value with TanStack Router tree as app shell.
- Scope:
  - Render router provider directly from `src/main.tsx`.
  - Remove unnecessary re-export indirection files.
- Acceptance Criteria:
  - `src/main.tsx` renders router provider directly.
  - `src/App.tsx` removed (or made unnecessary and unused).
  - Build/typecheck passes for touched code.
- Files:
  - `src/main.tsx`
  - `src/App.tsx`
  - `src/features/setup/workspace.tsx`

### CLN-02: Split `useSetupModel` God hook
- Status: TODO
- Problem: One hook currently owns draft state, schedule logic, mutation/error state, and snapshot bootstrapping.
- Scope:
  - Split into focused hooks with narrow responsibilities.
- Acceptance Criteria:
  - At least 3 focused hooks extracted.
  - Existing setup flow behavior preserved.
  - Hook exports remain easy to consume from setup UI.
- Files:
  - `src/features/setup/hooks/useSetupModel.ts`
  - new focused hook files under `src/features/setup/hooks/`

### CLN-03: Centralize app auth computation
- Status: DONE
- Problem: Auth composition logic duplicated in multiple locations.
- Scope:
  - Add shared hook `useAppAuth`.
  - Replace duplicated auth calculation callsites.
- Acceptance Criteria:
  - Single source of truth for `isAuthenticated` logic.
  - All current callsites migrated.
- Files:
  - `src/router.tsx`
  - `src/features/setup/hooks/useSetupModel.ts`
  - `src/features/setup/hooks/useLocalePreferenceModel.ts`
  - `src/hooks/useAppAuth.ts` (new)

### CLN-04: Remove derived-state reset effect in `AppointmentManager`
- Status: DONE
- Problem: `useEffect` resets slot state after render, causing avoidable extra render and temporary invalid state.
- Scope:
  - Replace effect-driven reset with render-time derived value.
- Acceptance Criteria:
  - Slot validity derived without post-render reset effect.
  - Booking submit path uses effective slot value.
- Files:
  - `src/features/setup/components/AppointmentManager.tsx`

### CLN-05: Remove prop-to-state sync effects for snapshot key
- Status: TODO
- Problem: Snapshot key is handled as partially controlled and partially derived state.
- Scope:
  - Choose one model (controlled or derived).
  - Remove sync effects that mirror props/results into local state.
- Acceptance Criteria:
  - Snapshot-key ownership model is explicit and singular.
  - Sync effects for key mirroring removed.
- Files:
  - `src/features/setup/hooks/useSetupModel.ts`
  - related route loader/state plumbing as needed

### CLN-06: Replace latest-ref callback pattern with `useEffectEvent` strategy
- Status: TODO
- Problem: Legacy latest-ref patterns are used for callback freshness.
- Scope:
  - Adopt `useEffectEvent` where supported by current React build, or document fallback wrapper if not.
- Acceptance Criteria:
  - Callback freshness handled without ref-sync boilerplate.
  - No regression in behavior.
- Files:
  - `src/features/setup/hooks/useSetupModel.ts`
  - `src/features/setup/hooks/useLocalePreferenceModel.ts`

### CLN-07: Add timeout/error path to auth wait guard
- Status: DONE
- Problem: Route can wait indefinitely during auth loading with no timeout fallback.
- Scope:
  - Add bounded wait and deterministic redirect/error handling.
- Acceptance Criteria:
  - Guard no longer hangs forever on unresolved auth loading.
  - Timeout path is tested or clearly validated.
- Files:
  - `src/routes/_authed.tsx`
  - `src/router.tsx`

### CLN-08: Fix stale `availabilityNowUtcMs` ref behavior
- Status: DONE
- Problem: Current timestamp is frozen at mount and can drift from real time.
- Scope:
  - Make timestamp refreshed/derived from current time when relevant.
- Acceptance Criteria:
  - Availability checks use near-current time.
  - Long-open tab behavior remains correct.
- Files:
  - `src/features/setup/components/AppointmentManager.tsx`

### CLN-09: Introduce Suspense boundaries for query-driven screens
- Status: TODO
- Problem: Manual `undefined` guards are repeated instead of declarative suspense boundaries.
- Scope:
  - Add route/screen suspense boundaries.
  - Move selected query consumers to suspense variants.
- Acceptance Criteria:
  - At least one primary route subtree uses suspense boundary.
  - Query-consuming component logic simplifies (fewer null guards).
- Files:
  - `src/features/setup/components/AppointmentManager.tsx`
  - `src/features/setup/components/PlannerSimulatorWorkspace.tsx`
  - `src/features/setup/components/SnapshotPanel.tsx`

### CLN-10: Add `/app/setup` loader prefetching
- Status: TODO
- Problem: Primary setup route lacks prefetch loader parity with appointments route.
- Scope:
  - Add loader prefetch for latest setup key and related snapshot data.
- Acceptance Criteria:
  - `/app/setup` route has loader-based prefetch.
  - Cold navigation shows reduced loading jitter.
- Files:
  - `src/routes/_authed/app.setup.tsx`
  - query helper files if needed

### CLN-11: Move appointment form to form-library pattern
- Status: TODO
- Problem: Form state/validation/accessibility are manually managed with multiple local states.
- Scope:
  - Introduce chosen form pattern (TanStack Form or React Hook Form) for appointment form.
- Acceptance Criteria:
  - Field-level validation/error handling is explicit.
  - Submission and disabled/pending states remain correct.
- Files:
  - `src/features/setup/components/AppointmentManager.tsx`

### CLN-12: Add feature-level error boundaries
- Status: TODO
- Problem: Root-only error boundary can take down entire app for isolated feature errors.
- Scope:
  - Add boundaries at route/feature boundaries.
- Acceptance Criteria:
  - Error in one major feature subtree does not crash whole app shell.
- Files:
  - route/feature entry components in `src/routes/` and `src/features/`

### CLN-13: Remove `null as unknown as QueryClient` context lie
- Status: TODO
- Problem: Type claims non-null QueryClient while runtime default is null.
- Scope:
  - Ensure router context is created with real QueryClient instance.
- Acceptance Criteria:
  - No unsafe type-cast placeholder for query client.
  - Router/context typing remains strict.
- Files:
  - `src/router.tsx`
  - router provider wiring

### CLN-14: Unify paginated data layer when adapter supports it
- Status: BLOCKED
- Blocker: `@convex-dev/react-query` currently lacks needed pagination parity for this migration.
- Scope:
  - Track adapter support and migrate when available.
- Acceptance Criteria:
  - Migration plan documented once adapter capability lands.
- Files:
  - `src/features/setup/components/AppointmentManager.tsx`

### CLN-15: Test mutation pending states in UI tests
- Status: TODO
- Problem: Current test mocks do not exercise pending state behavior.
- Scope:
  - Add test coverage for disabled/loading states during mutations.
- Acceptance Criteria:
  - At least one test asserts pending state UX.
- Files:
  - `src/App.test.tsx`
  - relevant test helpers

### CLN-16: Replace raw Tailwind constants with component/CVA pattern
- Status: TODO
- Problem: Raw class constants reduce variant safety and composability.
- Scope:
  - Migrate styling constants to component wrappers or CVA where variants exist.
- Acceptance Criteria:
  - No central raw-style constants for migrated paths.
  - Styling behavior unchanged visually for migrated components.
- Files:
  - `src/features/setup/constants.ts`
  - related setup UI components

### CLN-17: Remove root `shared/` dumping-ground pattern
- Status: TODO
- Problem: Domain files in root `shared/` risk becoming a catch-all.
- Scope:
  - Move domain-owned error-code files to owning domain location.
  - Keep truly cross-layer locale definitions in shared location only if justified.
- Acceptance Criteria:
  - Domain error code files moved out of root `shared/`.
  - Imports updated without behavior change.
- Files:
  - `shared/setupErrorCodes.ts`
  - `shared/schedulingErrorCodes.ts`
  - `shared/locales.ts`

## Progress Log
- 2026-02-22: Converted cleanup report into PRD-style backlog with explicit status lifecycle for agent loop execution.
- 2026-02-22: Removed slot reset effect; derived effective slot selection during render in `AppointmentManager`.
- 2026-02-22: Centralized auth state in `useAppAuth` and migrated router/setup hooks.
- 2026-02-22: Started CLN-07; researching bounded auth wait handling.
- 2026-02-22: Completed CLN-07; added auth wait timeout with redirect + test coverage.
- 2026-02-22: Updated appointment availability clock to refresh on interval to prevent stale slot filtering.
- 2026-02-22: Completed CLN-01 by removing `App.tsx`/workspace re-export indirection and updating route imports/mocks.
