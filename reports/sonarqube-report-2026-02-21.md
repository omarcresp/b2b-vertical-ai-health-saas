# SonarQube Analysis Report — B2B Vertical SaaS

**Date:** 2026-02-21
**Branch:** `main`
**SonarQube Version:** Community Build 26.2.0.119303
**Scanner Version:** SonarScanner CLI 8.0.1.6346
**Quality Gate:** ✅ PASSED

---

## Executive Summary

The codebase is in **good overall shape**. Quality Gate passes with zero vulnerabilities and no duplicated code. The primary concern is a **ReDoS (Regular Expression Denial of Service) security hotspot** in the backend validation layer that must be reviewed before production traffic scales. Secondary concerns are low-severity code smell patterns and below-target test coverage.

| Signal | Status |
|---|---|
| Security Vulnerabilities | ✅ 0 |
| Bugs | ⚠️ 1 (MAJOR) |
| Code Smells | ℹ️ 10 (all MINOR/MAJOR) |
| Security Hotspots (pending review) | 🔴 1 (MEDIUM — ReDoS) |
| Duplicated Code | ✅ 0% |
| Quality Gate | ✅ PASSED |

---

## Project Metrics

| Metric | Value |
|---|---|
| Lines of Code (NCLOC) | 4,444 |
| Total Lines | 5,017 |
| Files Analyzed | 66 |
| Functions | 279 |
| Classes | 2 |
| Statements | 857 |
| Comment Density | 0.3% |
| Test Coverage | 22.8% |
| Cyclomatic Complexity | 522 |
| Cognitive Complexity | 245 |
| Duplicated Lines | 0 |
| Duplicated Blocks | 0 |

---

## Quality Ratings

| Dimension | Rating | Score |
|---|---|---|
| Reliability | C | 3.0 / 5.0 |
| Security | A | 1.0 / 5.0 |
| Maintainability | A | 1.0 / 5.0 |
| Duplication | A | 0.0% |
| Coverage | — | 22.8% (target: ≥80%) |

> **Rating scale:** A = best, E = worst. Reliability is C because of the 1 known CSS bug (false positive — see below).

---

## Issue Summary

| Type | Severity | Count |
|---|---|---|
| Bug | MAJOR | 1 |
| Code Smell | MAJOR | 1 |
| Code Smell | MINOR | 9 |
| Security Hotspot | MEDIUM (to review) | 1 |
| Vulnerability | — | 0 |

**Total technical debt estimate:** 47 minutes

---

## Detailed Findings

---

### 1. SECURITY HOTSPOT — ReDoS Risk

**Priority: P0 — Must resolve before production scale**

| Field | Value |
|---|---|
| File | `convex/setupValidation.ts:95` |
| Rule | `typescript:S5852` |
| Category | Denial of Service (DoS) |
| Probability | MEDIUM |
| Status | TO_REVIEW |

**Flagged regex:**
```ts
.replace(/(^-+)|(-+$)/g, "");
```

**Why it matters:**
The alternation group `(^-+)|(-+$)` uses anchors with quantifiers in a way that could exhibit super-linear backtracking on adversarially crafted strings. Since `normalizeClinicSlug()` operates on user-supplied input in a Convex mutation, a crafted input could cause CPU exhaustion on the serverless function worker.

**Recommended fix:**
Replace the combined alternation with two chained `replaceAll` calls using simpler, anchor-bounded patterns — or rewrite using a non-backtracking approach:

```ts
// Before (flagged)
.replace(/(^-+)|(-+$)/g, "");

// After (safe — two explicit trims, no alternation backtracking)
.replace(/^-+/g, "")
.replace(/-+$/g, "");
```

Each pattern anchored alone cannot cause catastrophic backtracking because there is no nested quantifier or alternation. Apply `replaceAll` where appropriate per the related S7781 findings.

**Acceptance criteria:**
- [ ] Regex at line 95 replaced with two separate non-alternating patterns
- [ ] Unit tests cover inputs with leading/trailing hyphens, all-hyphens, and Unicode slug edge cases
- [ ] Sonar hotspot marked as "Safe" or closed after fix

---

### 2. BUG — Unknown CSS At-Rule (False Positive)

**Priority: P3 — Acknowledge / suppress**

| Field | Value |
|---|---|
| File | `src/index.css:5` |
| Rule | `css:S4662` |
| Severity | MAJOR |
| Effort | 1 min |
| Message | `Unexpected unknown at-rule "@custom-variant"` |

**Context:**
`@custom-variant dark (&:is(.dark *));` is a **Tailwind CSS v4 directive** that is valid in Tailwind's PostCSS pipeline. SonarQube's CSS parser does not know Tailwind v4 at-rules and flags it as unknown. This is a **false positive** — the build compiles correctly.

**Recommended action:**
Add a SonarQube issue suppression for this line only, or document it as a known scanner limitation. Do not remove the directive.

```css
/* src/index.css */
/* sonar-disable-next-line css:S4662 */
@custom-variant dark (&:is(.dark *));
```

**Acceptance criteria:**
- [ ] Issue suppressed or documented as false positive in the SonarQube dashboard

---

### 3. CODE SMELL — Prefer `String#replaceAll()` over `String#replace()`

**Priority: P2 — Quick wins (5 min total)**

| Field | Value |
|---|---|
| File | `convex/setupValidation.ts:93–95` |
| Rule | `typescript:S7781` |
| Severity | MINOR |
| Effort | 5 min × 3 = 15 min |

**Affected lines:**
```ts
// Line 93
.replace(/[\u0300-\u036f]/gu, "")
// Line 94
.replace(/[^a-z0-9]+/gu, "-")
// Line 95 — also the ReDoS hotspot above
.replace(/(^-+)|(-+$)/g, "");
```

**Recommended fix:**
```ts
const normalized = value
  .trim()
  .toLowerCase()
  .normalize("NFKD")
  .replaceAll(/[\u0300-\u036f]/gu, "")
  .replaceAll(/[^a-z0-9]+/gu, "-")
  .replace(/^-+/g, "")   // replaceAll not needed for anchored patterns
  .replace(/-+$/g, "");
```

> Note: `replaceAll` with a regex requires the `g` flag — all three patterns already have it.

**Acceptance criteria:**
- [ ] All three `replace()` calls updated to `replaceAll()` where semantically identical
- [ ] ReDoS hotspot at line 95 also fixed (see §1)

---

### 4. CODE SMELL — Use `export … from` for Re-exports

**Priority: P4 — Minor style consistency**

| Field | Value |
|---|---|
| File | `src/App.tsx:9` |
| Rule | `typescript:S7763` |
| Severity | MINOR |
| Effort | 5 min |

**Current code:**
```ts
// src/App.tsx
import SetupWorkspaceApp, {
  SetupWorkspaceShell,
} from "@/features/setup/workspace";

export default function App() {
  return <SetupWorkspaceApp />;
}

export { SetupWorkspaceShell };   // ← flagged: import-then-re-export
```

**Recommended fix:**
```ts
export { SetupWorkspaceShell } from "@/features/setup/workspace";
```

This eliminates an unnecessary round-trip import and makes the re-export intent explicit. The default export (`App`) is unaffected.

**Acceptance criteria:**
- [ ] `SetupWorkspaceShell` re-exported directly via `export … from` without going through an import statement

---

### 5. CODE SMELL — `useState` Not Destructured into Value + Setter Pair

**Priority: P4 — Minor React best practice**

| Field | Value |
|---|---|
| File | `src/components/theme-provider.tsx:45` |
| Rule | `typescript:S6754` |
| Severity | MINOR |
| Effort | 5 min |

**Current code:**
```ts
const [theme, setThemeState] = useState<Theme>(() => { ... });
```

SonarQube's rule S6754 expects the setter to be named by convention `set<Value>` directly (i.e., `setTheme` not `setThemeState`). The issue is that the public API exposes a `setTheme` wrapper (`useCallback`) to apply side effects, so `setThemeState` is intentionally private.

**Recommended fix options:**
- Rename the raw state setter to `setTheme` and rename the public wrapper to `applyTheme` or `changeTheme`:
```ts
const [theme, setTheme] = useState<Theme>(() => { ... });
const applyTheme = useCallback((value: Theme) => {
  setTheme(value);
  // side effects…
}, [storageKey]);
```
- Or suppress the rule with an inline comment if the naming is intentional for clarity.

**Acceptance criteria:**
- [ ] Naming convention aligned with S6754, or suppression justified in code comment

---

### 6. CODE SMELL — React Props Not Marked as `Readonly`

**Priority: P4 — TypeScript defensive typing**

| Field | Value |
|---|---|
| File | `src/components/ui/dropdown-menu.tsx:7, 13, 197` |
| Rule | `typescript:S6759` |
| Severity | MINOR |
| Effort | 5 min × 3 = 15 min |

**Context:**
Three sub-components in the `dropdown-menu.tsx` shadcn primitive define props inline or as plain types without `Readonly<>`. Since this is owned shadcn code (not an unmodified third-party file), linting applies.

**Recommended fix:**
```ts
// Before
type DropdownMenuItemProps = React.ComponentPropsWithoutRef<typeof Item> & {
  inset?: boolean;
};

// After
type DropdownMenuItemProps = Readonly<React.ComponentPropsWithoutRef<typeof Item> & {
  inset?: boolean;
}>;
```

Apply to all three flagged component prop types.

> Note: This is a shadcn-owned component that has been modified. If you wish to stay closer to upstream shadcn updates, add a per-file sonar suppression instead.

**Acceptance criteria:**
- [ ] Props at lines 7, 13, and 197 are typed with `Readonly<>` wrappers, or rule suppressed for shadcn primitive files

---

### 7. CODE SMELL — Unexpected Negated Condition

**Priority: P4 — Readability**

| Field | Value |
|---|---|
| File | `src/features/setup/components/AppointmentManager.tsx:180` |
| Rule | `typescript:S7735` |
| Severity | MINOR |
| Effort | 2 min |

**Current code:**
```tsx
{!snapshot ? (
  <SnapshotUnavailable model={model} />
) : (
  <>…</>
)}
```

Sonar flags inverted ternary conditions (positive case should come first). This is a style preference with minor readability impact.

**Recommended fix:**
```tsx
{snapshot ? (
  <>…</>
) : (
  <SnapshotUnavailable model={model} />
)}
```

**Acceptance criteria:**
- [ ] Condition rewritten so the non-negated (happy path) branch appears first

---

### 8. CODE SMELL — Broad `eslint-disable` Without Rule Specification

**Priority: P3 — Generated file, special handling required**

| Field | Value |
|---|---|
| File | `src/routeTree.gen.ts:1` |
| Rule | `typescript:S7724` |
| Severity | MAJOR |
| Effort | 5 min |

**Current code:**
```ts
/* eslint-disable */
```

**Context:**
`routeTree.gen.ts` is an **auto-generated file** (by TanStack Router). The blanket `eslint-disable` is expected and correct. This is a false positive in the sense that the file should never be manually edited.

**Recommended fix:**
Add this file to the SonarQube exclusion list in `sonar-project.properties` or the scanner flags:
```
-Dsonar.exclusions=...,**/routeTree.gen.ts
```

Alternatively, replace the blanket disable with specific rule suppressions matching what TanStack actually generates, but that creates a maintenance burden with each regeneration.

**Acceptance criteria:**
- [ ] `routeTree.gen.ts` added to sonar exclusions so generated code doesn't pollute results

---

## Test Coverage Analysis

| Metric | Current | Target |
|---|---|---|
| Line Coverage | 22.8% | ≥ 80% |
| Gap | 57.2 pp | — |

**Scanner notes:**
- 1 unresolved path in `lcov.info` (`src/i18n/i18next.d.ts` — type declaration, not testable code)
- 612 inconsistencies reported in coverage report (likely line-number drift between runs)

**Coverage observations from scan:**
The 22.8% figure is pulled from the existing `coverage/lcov.info`. The main uncovered areas by file type are likely:
- Convex backend functions (mutations, queries) — hardest to unit test, highest business risk
- Feature-level React components beyond basic renders
- i18n locale mapping functions

**Recommended coverage improvements (prioritized):**

| Area | Rationale | Effort |
|---|---|---|
| `convex/setupValidation.ts` | Auth/validation layer — highest risk, logic is pure and easily testable | Low |
| `convex/myFunctions.ts` | Core data access — authz boundaries must be tested | Medium |
| `src/features/setup/` | User-visible flows tied to revenue | Medium |
| `src/lib/` | Pure utils — cheap to test, high value | Low |

---

## Technical Debt Summary

| Category | Issues | Estimated Effort |
|---|---|---|
| Security Hotspot (ReDoS) | 1 | 10 min (fix) + 20 min (tests) |
| CSS false positive | 1 | 1 min (suppress) |
| String API modernization | 3 | 15 min |
| Re-export style | 1 | 5 min |
| React best practices | 5 (useState, readonly props, negated condition) | 22 min |
| Generated file exclusion | 1 | 2 min |
| **Total** | **12** | **~75 min** |

---

## Priority Remediation Plan

| Priority | Action | File(s) | Effort | Risk if Deferred |
|---|---|---|---|---|
| **P0** | Fix ReDoS regex in `normalizeClinicSlug` | `convex/setupValidation.ts:95` | 30 min | Server CPU exhaustion under adversarial input |
| **P2** | Replace `replace()` → `replaceAll()` | `convex/setupValidation.ts:93–94` | 10 min | Code smell accumulation, minor API inconsistency |
| **P3** | Suppress CSS false positive (`@custom-variant`) | `src/index.css:5` | 2 min | Noise in quality gate reports |
| **P3** | Exclude `routeTree.gen.ts` from analysis | `sonar-project.properties` or scanner flags | 2 min | Ongoing MAJOR noise from generated code |
| **P4** | Use `export … from` for `SetupWorkspaceShell` | `src/App.tsx:9` | 5 min | Minor style inconsistency |
| **P4** | Rename `setThemeState` → `setTheme` + `applyTheme` | `src/components/theme-provider.tsx:45` | 5 min | None functional |
| **P4** | Add `Readonly<>` to `dropdown-menu` props | `src/components/ui/dropdown-menu.tsx:7,13,197` | 15 min | No runtime risk; TypeScript defensive hygiene |
| **P4** | Invert negated ternary | `src/features/setup/components/AppointmentManager.tsx:180` | 2 min | Readability only |
| **P5** | Increase test coverage from 22.8% → 80%+ | `convex/`, `src/features/`, `src/lib/` | Multi-sprint | Undetected regressions in validation and auth |

---

## False Positives & Known Limitations

| Issue | File | Reason |
|---|---|---|
| `css:S4662` — `@custom-variant` | `src/index.css:5` | Tailwind CSS v4 directive, valid in project build |
| `typescript:S7724` — `eslint-disable` | `src/routeTree.gen.ts:1` | Auto-generated by TanStack Router, must not be edited |

These should be marked as "Won't Fix" / "False Positive" in the SonarQube dashboard or excluded from future scans.

---

## Recommendations for CI Integration

To prevent regressions, add the scanner to CI with these flags:

```yaml
# In CI pipeline
- name: SonarQube Scan
  run: |
    sonar-scanner \
      -Dsonar.projectKey=b2b-vertical-saas \
      -Dsonar.exclusions="**/node_modules/**,**/dist/**,**/_generated/**,**/coverage/**,**/routeTree.gen.ts" \
      -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
      -Dsonar.scm.disabled=true \
      -Dsonar.qualitygate.wait=true  # Fail CI on gate failure
```

Set quality gate thresholds:
- **New code coverage:** ≥ 80%
- **New vulnerabilities:** 0
- **New bugs:** 0
- **New hotspots to review:** 0

---

*Report generated by SonarQube Community Build 26.2.0.119303 on 2026-02-21. All findings reflect the state of branch `main` at time of scan.*
