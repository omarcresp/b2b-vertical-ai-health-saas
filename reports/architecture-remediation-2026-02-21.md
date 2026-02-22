# Architecture & Code Quality Remediation Report
## B2B Vertical SaaS — Medical Clinic Scheduling (LATAM)

**Date:** 2026-02-21
**Branch:** `main`
**Reviewed by:** Deep architectural review + SonarQube Community Build 26.2.0.119303
**Quality Gate:** PASSED (default gate — no conditions configured; misleading)
**Stack:** React 19 · TanStack Router v1 · Convex · WorkOS AuthKit · i18next · Vitest · Biome · Bun

---

## Executive Summary

The codebase has solid fundamentals: correct server-side auth, indexed Convex queries (mostly), idempotent mutations, stable error-code abstraction, and meaningful backend tests. However, two critical security holes exist that must be closed before this product handles real clinic data. Additionally, there are serious Convex query performance anti-patterns, a timezone correctness bug that will silently store wrong appointment times, and a 1767-line god file that is already accruing cognitive complexity debt.

SonarQube confirmed: **2 bugs, 39 code smells, 1 security hotspot** across 4,083 NCLOC. Reliability rating is **C** (3.0). The quality gate passed only because no conditions were configured — the project is not production-ready.

---

## SonarQube Metrics Snapshot

| Metric | Value | Rating |
|--------|-------|--------|
| Lines of Code | 4,083 | — |
| Files | 42 | — |
| Functions | 264 | — |
| Cyclomatic Complexity | 503 | — |
| Cognitive Complexity | 250 | — |
| Bugs | **2** | **C (3.0)** |
| Vulnerabilities | 0 | A (1.0) |
| Security Hotspots | **1** | — |
| Code Smells | **39** | A (1.0) |
| Technical Debt | 3h 4min | A (1.0) |
| Test Coverage | 58.0% | — |
| Duplication | 0.0% | A (1.0) |
| Quality Gate | OK* | *No conditions set |

**Issue Severity Breakdown:**
| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| MAJOR | 9 |
| MINOR | 30 |
| BLOCKER | 0 |

---

## Issue Registry

All issues below are sourced from architectural review, manual code inspection, and SonarQube static analysis. They are unified, deduplicated, and prioritized.

---

## P0 — CRITICAL SECURITY (Ship blocker. Fix before any real data enters the system.)

---

### SEC-01: Missing ownership check on clinic update in `upsertClinicProviderSetup`

**Source:** Manual review
**File:** `convex/setup.ts:89-111`
**Risk:** Multi-tenant data isolation failure — any authenticated user can overwrite any clinic's data by knowing or guessing its slug.

**Root cause:** The mutation correctly assigns `createdBySubject` on clinic creation but never calls `assertClinicOwner` when updating an existing clinic. The ownership check helper exists in `convex/scheduling.ts` but was never ported to the setup mutation.

```typescript
// CURRENT — no ownership check on update path
const clinic = await ctx.db.query("clinics")
  .withIndex("by_slug", (q) => q.eq("slug", clinicSlug))
  .unique();

const clinicId = clinic
  ? clinic._id                         // <- another user's clinic
  : await ctx.db.insert("clinics", { ..., createdBySubject: identity.subject });

if (clinic) {
  await ctx.db.patch(clinicId, { name, city, timezone }); // <- overwrites it silently
}

// REQUIRED — add before any patch
if (clinic && clinic.createdBySubject !== identity.subject) {
  throw new ConvexError({ code: SETUP_ERROR_CODES.FORBIDDEN });
}
```

**Acceptance criteria:** A user who submits a clinic name that normalizes to an existing slug they do not own receives a `FORBIDDEN` error. Confirmed by a new test in `convex/setup.test.ts`.

---

### SEC-02: Missing ownership check on `getSetupSnapshot`

**Source:** Manual review
**File:** `convex/setup.ts:187-263`
**Risk:** Any authenticated user can read another clinic's full configuration (name, provider, schedule, appointment counts) by knowing its slug.

**Root cause:** `getSetupSnapshot` authenticates the caller but does not verify `clinic.createdBySubject === identity.subject`. The scheduling queries (`resolveClinicProviderForOwner`) do this correctly. The setup query does not.

```typescript
// After fetching clinic, add:
if (clinic.createdBySubject !== identity.subject) {
  return null; // or throw FORBIDDEN — consistent with scheduling behavior
}
```

**Acceptance criteria:** An authenticated user querying `getSetupSnapshot` with another user's clinic slug receives `null` (or a FORBIDDEN error). Confirmed by a new backend test.

---

## P0 — CRITICAL DATA CORRECTNESS

---

### BUG-01: `combineDateAndMinuteToUtcMs` uses browser timezone instead of clinic timezone

**Source:** Manual review
**File:** `src/features/setup/workspace.tsx:196-222`
**Risk:** Appointments created by a user whose device timezone differs from the clinic's timezone are stored with wrong UTC timestamps. Silent data corruption — no error is thrown.

**Root cause:** `new Date(year, month, day, hours, minutes)` constructs a date in the **browser's local timezone**, not the clinic's configured timezone (e.g., `America/Mexico_City`). A clinic owner traveling in Madrid booking a 9:00am appointment creates a UTC timestamp 6–7 hours off.

```typescript
// CURRENT — always uses device local timezone
const withTime = new Date(
  baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(),
  hours, minutes, 0, 0,
);
return withTime.getTime(); // wrong if device !== clinic timezone
```

**Required fix:** Use `Intl`-based timezone conversion or add `temporal-polyfill` / `date-fns-tz`:

```typescript
// Using date-fns-tz (or equivalent)
import { fromZonedTime } from 'date-fns-tz';

function combineDateAndMinuteToUtcMs(
  dateValue: string,
  minuteOfDay: number,
  timezone: string,   // <- pass clinic.timezone
) {
  const baseDate = parseDateInput(dateValue);
  if (!baseDate) return null;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const localDateString = `${dateValue}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`;
  return fromZonedTime(localDateString, timezone).getTime();
}
```

The `timezone` value is already available from `snapshot.clinic.timezone`.

**Acceptance criteria:** An appointment booked at "09:00" for a clinic in `America/Mexico_City` stores a UTC timestamp equivalent to 09:00 CST regardless of the booker's device timezone. Unit test added to `time.test.ts` with at least two timezone scenarios.

---

### BUG-02 (Sonar `typescript:S6551`): `location.search` stringifies as `[object Object]`

**Source:** SonarQube MINOR | `src/routes/_authed.tsx:13`

```typescript
// CURRENT
search: {
  redirect: `${location.pathname}${location.search}`, // location.search is an object in TSR
}
```

In TanStack Router, `location.search` is a parsed object, not a query string. Interpolating it produces `[object Object]`. Use `location.href` or serialize properly.

---

## P1 — SERIOUS PERFORMANCE (Fix before scaling beyond a handful of clinics)

---

### PERF-01: `listAppointmentsForOwner` ignores composite index range capability

**Source:** Manual review
**File:** `convex/scheduling.ts:194-208`
**Risk:** Full provider appointment load on every query. Will hit Convex document limits and degrade with appointment volume.

The index `by_providerId_and_startAtUtcMs` on `["providerId", "startAtUtcMs"]` supports range queries on `startAtUtcMs` after filtering by `providerId`. The code ignores this:

```typescript
// CURRENT — loads ALL appointments for provider, filters in JS
const appointments = await ctx.db
  .query("appointments")
  .withIndex("by_providerId_and_startAtUtcMs", (q) =>
    q.eq("providerId", provider._id), // only uses first field
  )
  .collect();                          // scans everything

return appointments
  .filter(a => a.startAtUtcMs >= args.rangeStartUtcMs &&
               a.startAtUtcMs <= args.rangeEndUtcMs)
  .sort(...)
  .slice(0, limit);

// REQUIRED — use the full composite index
const appointments = await ctx.db
  .query("appointments")
  .withIndex("by_providerId_and_startAtUtcMs", (q) =>
    q.eq("providerId", provider._id)
     .gte("startAtUtcMs", args.rangeStartUtcMs)
     .lte("startAtUtcMs", args.rangeEndUtcMs),
  )
  .take(limit);
```

**Acceptance criteria:** The query uses `.take(limit)` after the range filter. Existing test coverage must verify date-range filtering still works correctly.

---

### PERF-02: `getMyLatestSetupKey` — Full table scan with no index

**Source:** Manual review
**Files:** `convex/setup.ts:276-278`, `convex/schema.ts`
**Risk:** Scans every clinic document on every app bootstrap. Catastrophic at scale.

```typescript
// CURRENT — full table scan
const ownedClinics = (await ctx.db.query("clinics").collect())
  .filter((clinic) => clinic.createdBySubject === identity.subject)
```

**Required fix — two steps:**

1. Add index to schema:
```typescript
clinics: defineTable({ ... })
  .index("by_slug", ["slug"])
  .index("by_createdBySubject", ["createdBySubject"]) // ADD THIS
```

2. Use it in the query:
```typescript
const ownedClinics = await ctx.db
  .query("clinics")
  .withIndex("by_createdBySubject", (q) =>
    q.eq("createdBySubject", identity.subject),
  )
  .collect();
```

Run `bunx convex codegen` after schema change.

**Acceptance criteria:** No unbounded `.collect()` on `clinics` without an index filter.

---

### PERF-03: `getSetupSnapshot` loads ALL appointments just to count them

**Source:** Manual review
**File:** `convex/setup.ts:228-234`

```typescript
// Loads every appointment just for a count
const appointments = await ctx.db
  .query("appointments")
  .withIndex("by_providerId_and_startAtUtcMs", (q) =>
    q.eq("providerId", provider._id),
  )
  .collect(); // entire history

return {
  appointmentSummary: {
    total: appointments.length,
    scheduled: appointments.filter(a => a.status === "scheduled").length,
  },
};
```

**Options (pick one):**
- **Denormalized counters:** Add `scheduledCount` and `totalCount` to `clinicBookingPolicies` or a new `clinicStats` table; increment/decrement in each appointment mutation.
- **Convex pagination + server-side aggregate:** Paginate through appointments in an action and cache the result.
- **Remove from snapshot entirely:** The snapshot screen probably doesn't need real-time appointment counts — show them only on the Appointments tab where the full list is already loaded.

**Acceptance criteria:** `getSetupSnapshot` does not call `.collect()` on the full appointments table.

---

## P2 — ARCHITECTURAL DEBT (Fix within next 2 sprints to prevent compounding)

---

### ARCH-01: `workspace.tsx` is a 1767-line god file

**Source:** Manual review + SonarQube (10 code smells, 2 CRITICAL flags including Cognitive Complexity 22 on `AppointmentManager`)
**File:** `src/features/setup/workspace.tsx`

One file contains: type definitions, constants, 8 utility functions, 2 custom hooks with their own state machines, a context/provider pair, 7 exported components, 5 internal UI primitives, and 3 major feature panels.

**Proposed split:**

```
src/features/setup/
  types.ts                     # SetupDraft, WindowRow, SnapshotKey, SetupPayload, TemplatePreset
  constants.ts                 # CITY_OPTIONS, DAY_VALUES, TEMPLATE_PRESETS, CSS class strings
  utils/
    time.ts                    # (already exists) parseTimeToMinute
    schedule.ts                # generateScheduleBasedTimeslots, computeWeeklyMinutes, formatMinute
    date.ts                    # parseDateInput, formatDateInput, combineDateAndMinuteToUtcMs
    payload.ts                 # buildSetupPayload, parseIntegerField
  hooks/
    useSetupModel.ts           # data + state machine (separate from UI)
    useLocalePreferenceModel.ts
  components/
    SetupWorkspaceProvider.tsx
    SetupWorkspaceShell.tsx
    PlannerSimulatorWorkspace.tsx
    AppointmentManager.tsx
    SnapshotPanel.tsx
    StatusAndSubmit.tsx
    fields/
      TextField.tsx
      NumberField.tsx
      CityField.tsx
```

**Acceptance criteria:** No file in `src/features/setup/` exceeds 300 lines. `AppointmentManager` and `PlannerSimulatorWorkspace` are independently importable without pulling in the full model or other panels.

---

### ARCH-02: Auth guard flashes protected content during loading

**Source:** Manual review
**File:** `src/routes/_authed.tsx:5-7`

When `context.auth.isLoading === true`, `beforeLoad` returns `undefined`, which causes TanStack Router to render the `Outlet` (protected children) before auth resolves.

```typescript
// CURRENT — Outlet renders during auth loading
beforeLoad: ({ context }) => {
  if (context.auth.isLoading) {
    return; // <- protected content flashes
  }
  if (!context.auth.isAuthenticated) {
    throw redirect({ to: context.navigation.callbackPath, ... });
  }
},
component: Outlet,

// REQUIRED — show a pending state
component: Outlet,
pendingComponent: () => <LoadingSpinner />, // or null
// AND in beforeLoad, throw a custom error or use pendingMs
```

A cleaner approach: use `pendingMs={0}` and a `pendingComponent` at the route level; always throw redirect immediately if not authenticated after loading resolves.

**Acceptance criteria:** No unauthenticated user can see the contents of `/_authed` subtree, even for a single render frame.

---

### ARCH-03: `navigation` in `RouterContext` is pointless indirection

**Source:** Manual review
**Files:** `src/router.tsx:13-15`, `src/routes/_authed.tsx:13`

`context.navigation.callbackPath` and `context.navigation.appPath` are constants that never change. They're passed through router context, re-memoized on every auth state change, and read via `context.navigation.callbackPath` when they could just be `"/callback"` — a string literal that TanStack Router already type-checks.

```typescript
// Remove from RouterContext entirely
// Before: throw redirect({ to: context.navigation.callbackPath, ... })
// After:  throw redirect({ to: "/callback", ... })
```

**Acceptance criteria:** `RouterContext` has no `navigation` property. Path strings are used directly and are type-checked by the router's generated types.

---

### ARCH-04: `useSetupModel` effect instability — options object reference

**Source:** Manual review
**File:** `src/features/setup/workspace.tsx:638-649`

The hook accepts an `options` object. Effects list `options.onSnapshotKeyChange` as a dependency. `onSnapshotKeyChange` is a `useCallback` in the parent that wraps `navigate`, which changes on route transitions. This creates a dependency chain where route navigation re-triggers the bootstrap effect.

```typescript
// The bootstrap effect fires whenever onSnapshotKeyChange changes
useEffect(() => {
  if (snapshotKey !== null) return;
  if (!bootstrappedSetupKey) return;

  setSnapshotKey(bootstrappedSetupKey);
  options.onSnapshotKeyChange?.(bootstrappedSetupKey); // calling navigate inside effect
}, [bootstrappedSetupKey, options.onSnapshotKeyChange, snapshotKey]);
```

**Fix:** Accept `initialSnapshotKey` and `onSnapshotKeyChange` as individual props (not an options object) and stabilize with `useRef` for the callback:

```typescript
const onSnapshotKeyChangeRef = useRef(onSnapshotKeyChange);
useEffect(() => { onSnapshotKeyChangeRef.current = onSnapshotKeyChange; });
// Use onSnapshotKeyChangeRef.current inside effects, not onSnapshotKeyChange directly
```

**Acceptance criteria:** Bootstrap effect does not re-run when navigating between tabs. Confirmed by integration test.

---

### ARCH-05: `useLocalePreferenceModel` — setState cascade inside effect

**Source:** Manual review
**File:** `src/features/setup/workspace.tsx:745-761`

```typescript
useEffect(() => {
  if (optimisticLocale && preferences.locale === optimisticLocale) {
    setOptimisticLocale(null); // <- setState triggers re-render, re-triggers effect
  }
  if (preferences.locale !== currentLocale) {
    void i18n.changeLanguage(preferences.locale); // <- external mutation #2
  }
}, [currentLocale, i18n, optimisticLocale, preferences?.locale]);
```

`i18n` is not a stable reference. Two mutations in one effect. Classic cascade.

**Fix:** Use a single reducer-style state for locale sync, or separate the server-sync effect from the optimistic-clear effect.

**Acceptance criteria:** No `setState` call inside the locale sync effect. `i18n` object removed from dependency array (use `useRef` or extract into stable callback).

---

## P2 — SONARQUBE CONFIRMED ISSUES

---

### SQ-01 (BUG, MAJOR): Regex operator precedence ambiguity — potential ReDoS

**Source:** SonarQube `typescript:S5850` + `typescript:S5852` (Security Hotspot: MEDIUM)
**File:** `convex/setupValidation.ts:86`

SonarQube flagged the slug normalization regex as:
1. Having ambiguous operator precedence (S5850 — classified as BUG)
2. Being vulnerable to super-linear backtracking — a ReDoS vector (S5852 — Security Hotspot)

The regex used in `normalizeClinicSlug` processes untrusted user input (clinic names). A maliciously crafted string could cause catastrophic backtracking.

**Action:** Audit the regex, add explicit grouping to clarify precedence, and validate that it cannot be exploited with pathological inputs. Replace `String.replace()` calls with `String.replaceAll()` (also flagged by Sonar MINOR `typescript:S7781` × 4 on same file).

**Acceptance criteria:** SonarQube security hotspot resolved. Slug normalization includes a max-length guard on input before regex application.

---

### SQ-02 (CODE_SMELL, CRITICAL): Empty `componentDidCatch` in `ErrorBoundary`

**Source:** SonarQube `typescript:S1186`
**File:** `src/ErrorBoundary.tsx:67`

An empty `componentDidCatch` is flagged as CRITICAL. Either implement error logging (Sentry, console.error in dev) or remove the method if it's intentionally a no-op.

```typescript
// CURRENT
componentDidCatch() {} // <- empty, CRITICAL

// REQUIRED — at minimum:
componentDidCatch(error: Error, info: ErrorInfo) {
  console.error("[ErrorBoundary]", error, info);
  // or: captureException(error, { extra: info });
}
```

---

### SQ-03 (CODE_SMELL, CRITICAL): `AppointmentManager` cognitive complexity 22 (limit: 15)

**Source:** SonarQube `typescript:S3776`
**File:** `src/features/setup/workspace.tsx:1337`

`AppointmentManager` has cognitive complexity of 22, exceeding the threshold of 15. Resolved as part of **ARCH-01** (splitting `workspace.tsx`). Once extracted and broken into sub-components, complexity will fall within limits naturally.

---

### SQ-04 (CODE_SMELL, MAJOR): `ThemeProvider` context value recreated every render

**Source:** SonarQube `typescript:S6481`
**File:** `src/components/theme-provider.tsx:71`

```typescript
// CURRENT — new object every render causes all consumers to re-render
<ThemeProviderContext.Provider value={{ theme, setTheme }}>

// REQUIRED
const contextValue = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
<ThemeProviderContext.Provider value={contextValue}>
```

---

### SQ-05 (CODE_SMELL, MAJOR): Nested ternary operations (× 3)

**Source:** SonarQube `typescript:S3358`
**Files:** `workspace.tsx:1265`, `workspace.tsx:1269`, `workspace.tsx:1571`

Three locations contain nested ternary chains that SonarQube flags as unreadable. Extract to early-return patterns or named variables. Resolved as part of **ARCH-01**.

---

### SQ-06 (CODE_SMELL, MAJOR): Array `.sort()` should use `.toSorted()` (× 2)

**Source:** SonarQube `typescript:S4043`
**Files:** `convex/setup.ts:250`, `convex/setupValidation.ts:199`

In-place `.sort()` mutates the array. Modern JS (ES2023+) provides `.toSorted()` for immutable sorting. The Convex runtime supports modern JS.

```typescript
// CURRENT
return weeklyWindows.sort((left, right) => ...)

// REQUIRED
return weeklyWindows.toSorted((left, right) => ...)
```

---

### SQ-07 (CODE_SMELL, MINOR): `Readonly<>` missing on component props (× 13)

**Source:** SonarQube `typescript:S6759`
**Files:** Multiple — `workspace.tsx` (× 9), `theme-provider.tsx`, `language-switcher.tsx`, `ConvexProviderWithAuthKit.tsx`, `dropdown-menu.tsx` (× 3), `app.tsx`

React component props should be `Readonly<Props>` to prevent accidental mutation. This is a one-line fix per component.

```typescript
// CURRENT
function TextField({ label, value, onChange }: { label: string; ... })

// REQUIRED
function TextField({ label, value, onChange }: Readonly<{ label: string; ... }>)
```

---

### SQ-08 (CODE_SMELL, MINOR): `window` should be `globalThis` (× 5)

**Source:** SonarQube `typescript:S7764`
**File:** `src/components/theme-provider.tsx:22,28,33,39,48,57`

`globalThis` is the universal cross-environment global (works in browser, Node, Deno, workers). Use it instead of `window`.

---

### SQ-09 (CODE_SMELL, MINOR): `useState` not destructured into value + setter (× 1)

**Source:** SonarQube `typescript:S6754`
**File:** `src/components/theme-provider.tsx:38`

```typescript
// CURRENT
const [state] = useState(...)

// REQUIRED
const [value, setValue] = useState(...)
```

---

### SQ-10 (CODE_SMELL, MINOR): Auto-disable comment in generated file too broad

**Source:** SonarQube `typescript:S7724`
**File:** `src/routeTree.gen.ts:1`

The generated file has a blanket disable comment without specifying which rules. Since this is auto-generated, add it to `sonar.exclusions` in the scanner config instead of using a disable comment.

---

## P3 — CONSISTENCY & CORRECTNESS

---

### CONS-01: Route navigation tabs are hardcoded English in a multi-language product

**Source:** Manual review
**File:** `src/routes/_authed/app.tsx:82-84`

```tsx
<RouteTab to="/app/setup">Setup</RouteTab>
<RouteTab to="/app/snapshot">Snapshot</RouteTab>
<RouteTab to="/app/appointments">Appointments</RouteTab>
```

The app has full `es-MX` and `es-CO` translation coverage, a language switcher, and server-persisted locale preferences. The primary navigation is hardcoded English. Add keys to `common.json` under `common:nav.*` and run `bun run i18n:check`.

---

### CONS-02: `RouteTab`'s `to` prop is untyped `string`

**Source:** Manual review
**File:** `src/routes/_authed/app.tsx:93`

```typescript
function RouteTab({ to, children }: { to: string; ... })
//                                        ^^^^^^ bypasses router type checking
```

TanStack Router generates type-safe path types. Use `LinkProps["to"]` or the router's `ValidateNavigateOptions` utilities. If `/app/setup` is renamed, TypeScript should catch broken `RouteTab` usage at compile time.

---

### CONS-03: `translate()` wrapper defeats all i18n type safety

**Source:** Manual review
**File:** `src/features/setup/workspace.tsx:302-308`

```typescript
function translate(t: AnyTFunction, key: string, ...) {
  return t(key as never, values as never) as unknown as string;
}
```

The project runs `i18n:typegen` to generate `types/i18next.generated.d.ts`, giving full type-safe `t()` calls. This wrapper casts everything to `never`, making the generated types worthless. Every key passed through `translate()` is unchecked — typos compile silently.

**Fix:** Use `t()` directly in each call site with proper namespace syntax: `t("setup:errors.client.integer", { field })`. Resolve the `AnyTFunction` type issue by typing `t` as `TFunction<["setup", "common"]>` from `useTranslation`.

---

### CONS-04: Rate limiter registered but enforced nowhere

**Source:** Manual review
**Files:** `convex/convex.config.ts`, `convex/rateLimiter.ts`

The rate limiter plugin is configured (120 req/min global, 30 req/min per-user) and registered in the app config. No mutation or query actually calls it. The protection is entirely absent at runtime.

**Fix:** Import the rate limiter in at least the high-impact mutations (`upsertClinicProviderSetup`, `createAppointmentForOwner`) and call it before the handler logic.

---

### CONS-05: `src/App.tsx` is a confusing re-export barrel

**Source:** Manual review
**File:** `src/App.tsx`

```typescript
// src/App.tsx — entire contents
export { parseTimeToMinute } from "@/features/setup/utils/time";
export { default, SetupWorkspaceShell } from "@/features/setup/workspace";
```

`App.tsx` is the canonical React entry-point by convention. Here it's a 3-line barrel that re-exports from a feature file. The actual `App` component (default export) lives in `workspace.tsx` and is named `App` there. This confuses navigation ("where is App?") and violates convention. Either own the barrel pattern explicitly (rename to `index.ts`) or move the default export to `App.tsx` properly.

---

### CONS-06: `isSnapshotKey()` — runtime type guard on Convex-typed return value

**Source:** Manual review
**File:** `src/features/setup/workspace.tsx:287-300`

`isSnapshotKey` is called on `latestSetupKey` which is typed as `{ clinicSlug: string; providerName: string } | null | undefined` by Convex codegen. A simple `latestSetupKey !== null && latestSetupKey !== undefined` (or `latestSetupKey != null`) is sufficient. The 13-line runtime type guard adds zero safety over what TypeScript already knows.

---

## P4 — REACT 19 MODERNIZATION

---

### MOD-01: `useContext` → `use()` for `SetupModelContext`

**Source:** Best practices
**File:** `src/features/setup/workspace.tsx:719`

React 19 introduced `use(Context)` as the idiomatic replacement for `useContext`. It works inside conditionals and reads context synchronously. Not a breaking change, but the codebase states React 19 as its baseline.

```typescript
// CURRENT (React pre-19)
const value = useContext(SetupModelContext);

// React 19
import { use } from "react";
const value = use(SetupModelContext);
```

---

### MOD-02: No `Suspense` within the feature — relies on `undefined` loading states

**Source:** Best practices
**Files:** `workspace.tsx` throughout

`useQuery` from Convex returns `undefined` while loading, which all components handle with explicit conditional rendering (`model.snapshot === undefined ? <Loading> : ...`). The 2026 Convex + React 19 pattern is `useSuspenseQuery` from `@convex-dev/react-query`, which integrates with React Suspense and removes all the manual `=== undefined` checks.

This is a larger migration but removes ~20 explicit loading checks and makes loading states composable via `<Suspense fallback={<Loading />}>`.

---

### MOD-03: No route `pendingComponent` configured

**Source:** Best practices
**File:** All route files

TanStack Router supports `pendingComponent` and `pendingMs` at the route level. No route in this codebase configures them. Route transitions have no loading indicator — the UI just freezes until the next render. At minimum, configure a `pendingComponent` on `/_authed/app` and its children.

---

## Coverage Gaps (58% overall)

| Area | Coverage | Risk |
|------|----------|------|
| `convex/scheduling.ts` | Via `scheduling.test.ts` — good | Low |
| `convex/setup.ts` | No test file exists | **HIGH** |
| `src/routes/_authed.tsx` | 57% | Medium |
| `src/routes/_authed/app.appointments.tsx` | 50% | Medium |
| `src/routes/_authed/app.setup.tsx` | 67% | Medium |
| `src/lib/i18n-errors.ts` | 52% | Medium |
| `src/i18n/index.ts` | 67% | Low |

**Critical gap:** `convex/setup.ts` has no test file despite containing the two security vulnerabilities identified in SEC-01 and SEC-02. Tests for `upsertClinicProviderSetup` ownership enforcement and `getSetupSnapshot` auth boundary are required as part of the SEC-01/SEC-02 fixes.

---

## Priority Remediation Plan

| Priority | ID | Issue | File(s) | Effort |
|----------|----|-------|---------|--------|
| 🔴 P0 | SEC-01 | Ownership check on clinic update | `convex/setup.ts` | 30min + test |
| 🔴 P0 | SEC-02 | Ownership check on getSetupSnapshot | `convex/setup.ts` | 30min + test |
| 🔴 P0 | BUG-01 | Timezone bug in appointment booking | `workspace.tsx` | 2h (dep + fix + test) |
| 🟠 P1 | PERF-01 | Use composite index range in listAppointments | `scheduling.ts` | 1h |
| 🟠 P1 | PERF-02 | Add createdBySubject index, fix table scan | `schema.ts`, `setup.ts` | 1h |
| 🟠 P1 | PERF-03 | Remove full appointment collect in snapshot | `setup.ts` | 2h |
| 🟠 P1 | BUG-02 | Fix `location.search` stringification | `_authed.tsx` | 15min |
| 🟡 P2 | ARCH-01 | Split 1767-line workspace.tsx | `features/setup/` | 1 day |
| 🟡 P2 | ARCH-02 | Auth guard loading flash | `_authed.tsx` | 1h |
| 🟡 P2 | ARCH-03 | Remove navigation from RouterContext | `router.tsx` | 30min |
| 🟡 P2 | ARCH-04 | Stabilize useSetupModel options deps | `workspace.tsx` | 1h |
| 🟡 P2 | ARCH-05 | Fix locale effect cascade | `workspace.tsx` | 1h |
| 🟡 P2 | SQ-01 | ReDoS regex + replaceAll | `setupValidation.ts` | 1h |
| 🟡 P2 | SQ-02 | Implement componentDidCatch | `ErrorBoundary.tsx` | 15min |
| 🟡 P2 | SQ-04 | Memoize ThemeProvider context value | `theme-provider.tsx` | 15min |
| 🟡 P2 | SQ-06 | Replace .sort() with .toSorted() | `setup.ts`, `setupValidation.ts` | 15min |
| 🟢 P3 | CONS-01 | Translate route tab labels | `app.tsx`, locales | 30min |
| 🟢 P3 | CONS-02 | Type-safe `to` in RouteTab | `app.tsx` | 15min |
| 🟢 P3 | CONS-03 | Remove translate() wrapper | `workspace.tsx` | 1h |
| 🟢 P3 | CONS-04 | Enforce rate limiter in mutations | `convex/` | 1h |
| 🟢 P3 | CONS-05 | Rename App.tsx or fix barrel | `App.tsx` | 15min |
| 🔵 P4 | SQ-07 | Add Readonly<> to component props | Multiple | 30min |
| 🔵 P4 | SQ-08 | window → globalThis | `theme-provider.tsx` | 10min |
| 🔵 P4 | MOD-01 | useContext → use() | `workspace.tsx` | 15min |
| 🔵 P4 | MOD-02 | Migrate to useSuspenseQuery | Multiple | 3–5 days |
| 🔵 P4 | MOD-03 | Add pendingComponent to routes | Route files | 1h |

---

## What Is Production-Ready (Do Not Touch)

- **Convex scheduling auth chain** — `resolveClinicProviderForOwner` correctly chains auth + slug lookup + ownership + provider lookup. Every scheduling function uses it.
- **Error code abstraction** — stable backend codes, frontend i18n mapping. No raw error strings crossing the wire.
- **Idempotent mutations** — confirm/cancel return `{ changed: true/false }`. Safe for retry.
- **Index usage in scheduling** — `by_clinicId_and_name`, `by_slug`, `by_subject` are used correctly everywhere except the three failures identified above.
- **Shared error code modules** — `shared/setupErrorCodes.ts` and `shared/schedulingErrorCodes.ts` are the right pattern. Do not collapse them.
- **Backend test coverage** — `convex/scheduling.test.ts` tests auth boundaries, idempotency, and state transitions with real Convex semantics via `convex-test`. This is the correct approach. Extend to `convex/setup.test.ts` (does not exist yet).
- **i18n fallback chain** — `es-CO → es → en-US`, locale detection, server persistence. Solid. Just remove the `translate()` wrapper that defeats it.
- **Zero code duplication** — Sonar confirmed 0.0%. Good discipline.

---

## Recommended Execution Order

**Sprint 1 (this week — security & correctness):**
SEC-01 → SEC-02 → BUG-01 → BUG-02 → PERF-01 → PERF-02 → SQ-01

**Sprint 2 (next week — architecture):**
ARCH-01 (workspace split) → ARCH-02 (auth flash) → ARCH-03 (router context) → SQ-02 → SQ-04 → SQ-06 → PERF-03

**Sprint 3 (polish):**
CONS-01 through CONS-05 → SQ-07 → SQ-08 → MOD-01 → MOD-03

**Future milestone:**
MOD-02 (useSuspenseQuery migration) — significant but mechanical once the god file is split.

---

*Report generated: 2026-02-21. SonarQube Community Build 26.2.0.119303. All P0 issues are blocking for production launch with real clinic data.*
