# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mission

Build a production-grade B2B vertical SaaS. Stack: React 19 + Vite + Tailwind + shadcn/ui frontend, Convex backend, WorkOS AuthKit.

**Operating principles:**
- Ship the smallest end-to-end slice first (tracer bullets), get feedback, then expand.
- Keep changes minimal and reversible. Preserve existing architecture unless explicitly asked to refactor.
- Do not invent product scope — if unclear, choose the smallest viable implementation.
- Never add dependencies without clear need. Avoid broad refactors during feature work.
- For architecture decisions, verify current best practices from primary sources before implementing.

## Commands

```bash
# Development
bun run dev              # Frontend + backend concurrently
bun run dev:frontend     # Vite only (http://localhost:5173)
bun run dev:backend      # Convex only

# Quality
bun run typecheck        # Type check (tsgo)
bun run lint             # Biome lint
bun run lint:fix         # Auto-fix lint issues
bun run format           # Biome format

# Testing
bun run test             # Run once
bun run test:watch       # Watch mode
bun run test:coverage    # HTML + LCOV coverage

# Build & CI
bun run build
bun ci && bun run typecheck && bun run lint && bun run build
```

Single test file: `bun run test src/lib/utils.test.ts`

After backend changes: `bunx convex codegen` to regenerate Convex type bindings.

## Architecture

Full-stack monorepo: React 19 frontend (Vite + TypeScript) with Convex serverless backend.

### Frontend (`src/`)

- Entry: `src/main.tsx` → `src/App.tsx`
- Auth bridge: `src/ConvexProviderWithAuthKit.tsx` (WorkOS AuthKit → Convex)
- UI components: `src/components/ui/` — shadcn/ui primitives (new-york style, owned code)
- Class composition: `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge)
- Path alias: `@/` → `src/`
- Styling: Tailwind CSS 4 via Vite plugin — no PostCSS config needed
- Add shadcn components: `bunx --bun shadcn@latest add <component>`

### Backend (`convex/`)

- `convex/myFunctions.ts` — queries, mutations, actions
- `convex/auth.config.ts` — WorkOS JWT provider config
- `convex/rateLimiter.ts` — global (120 req/min fixed window) + per-user (30 req/min token bucket)
- `convex/convex.config.ts` — app-level plugin registration
- `convex/_generated/` — auto-generated types, never edit manually

**Function patterns:**
```ts
export const myQuery = query({
  args: { value: v.string() },
  handler: async (ctx, args) => { ... },
});

export const myMutation = mutation({
  args: { value: v.number() },
  handler: async (ctx, args) => { ... },
});

export const myAction = action({ // use for external APIs or non-deterministic logic
  args: {},
  handler: async (ctx, args) => { ... },
});
```

Frontend consumption: `useQuery(api.myFunctions.myQuery, args)`, `useMutation(api.myFunctions.myMutation)`.

### Auth Flow

WorkOS → JWT → Convex: user logs in via WorkOS AuthKit, JWT is passed through `ConvexProviderWithAuthKit`, accessible in Convex functions via `ctx.auth.getUserIdentity()`.

### Environment Variables

Copy `.env.local.example` → `.env.local`:
```
VITE_WORKOS_CLIENT_ID=       # WorkOS client ID
VITE_WORKOS_REDIRECT_URI=    # http://localhost:5173/callback (local)
VITE_CONVEX_URL=             # From `npx convex dev` output
```

### Tooling

- **Package manager**: Bun — never use npm/yarn
- **Linter/formatter**: Biome (`biome.jsonc`) — not ESLint/Prettier
- **Type checker**: `tsgo`; use `typecheck:compat` for tsc compatibility check
- **Tests**: Vitest + jsdom; test setup at `src/test/setup.ts`
- **Code quality**: SonarCloud via `coverage/lcov.info`; config in `sonar-project.properties`

### i18next (i18n:next) Usage

- i18n runtime entrypoint: `src/i18n/index.ts`; imported once in `src/main.tsx`.
- Source locale: `en-US`. User-selectable locales: `en-US`, `es-MX`, `es-CO`; fallback-only locale: `es`.
- Keep translations in `src/i18n/locales/<locale>/<namespace>.json` and prefer stable namespaces (`common`, `setup`).
- Use explicit namespaced keys in UI (`t("setup:header.title")`) and avoid runtime-built keys.
- Keep backend localized messaging code-based: throw stable error codes server-side and map in `src/lib/i18n-errors.ts`.
- Persist user locale via Convex `userPreferences`; apply locale optimistically in UI, then sync server preference.

**i18n workflow**
1. Add/update English (`en-US`) keys first.
2. Add corresponding keys in `es`, `es-MX`, `es-CO`.
3. Run `bun run i18n:extract`.
4. Run `bun run i18n:lint`.
5. Run `bun run i18n:typegen`.
6. Run `bun run i18n:check`.

**i18n best practices**
- Prefer static keys and interpolation values over string concatenation.
- Keep keys semantic and stable; never reuse one key for unrelated UI copy.
- Keep business logic locale-independent (codes/enums); translate only at the presentation layer.
- Add/adjust tests for visible translated labels on critical flows after copy changes.
- When adding locales or namespaces, update loader config and fallback behavior in `src/i18n/index.ts`.

## Code Standards

- **No barrel files.** Never create `index.ts` files that only re-export from sibling modules. Import directly from the source file (`./fields/TextField`, not `./fields`). Barrel files obscure where logic actually lives, break tree-shaking, and make coverage meaningless for the re-exporting file.
- Strict TypeScript. All Convex function args require `v.` validators — no unvalidated input accepted.
- Auth/authz must be enforced server-side inside Convex functions, not just on the client.
- Use indexes over unbounded table scans in Convex queries.
- Use `internalQuery`/`internalMutation`/`internalAction` for backend-only functions not exposed to clients.
- Queries must be deterministic — put external API calls and side effects in actions only.
- Scheduling: `ctx.scheduler.runAfter()` / `ctx.scheduler.runAt()`; recurring jobs go in `convex/crons.ts`.
- Pagination: `.paginate(paginationOpts)` on the backend + `usePaginatedQuery` on the frontend for large datasets.
- Keep UI accessible: semantic elements, ARIA roles, keyboard support.

## Testing Strategy

**Core rule:** Every test must answer — *what concrete bug or risk would this catch?* If no clear answer, don't add the test.

**Pyramid (in order of volume):**
1. **Unit** (majority): pure utils, formatters, mapping logic.
2. **Component** (targeted): user-visible behavior for custom components and flows.
3. **Backend** (required for critical logic): Convex authz, validation, invariants, business rules.
4. **E2E** (few): auth flow and core revenue/admin workflows only.

**Must test in Convex:**
- Auth/authz boundaries — unauthenticated and unauthorized access attempts.
- Input validation — confirmed rejection of invalid payloads.
- Data integrity invariants and idempotency-sensitive mutations.
- Rate-limit protected paths where abuse has product impact.

**shadcn/ui policy:** Do not test untouched primitive behavior. Do test: custom wrappers/compositions, added variants, changed accessibility or interaction logic.

**Don't test:** trivial smoke renders, private state shape, CSS class internals, framework internals.

**Test design:**
- User-centric assertions: `getByRole`, visible outcomes — not implementation details.
- Deterministic: no real network calls unless intentional integration/E2E.
- Small, independent, explicit. Always include at least one failure-path assertion for critical logic.
- Coverage is a guardrail, not a goal — enforce meaningful growth around changed logic only.

## Research Workflow

For non-trivial implementation or architecture decisions:
1. Check official docs first (`web-search` for focused lookups).
2. Check local skills in `.agents/skills/*/SKILL.md` if the topic is relevant.
3. Use `context7` for library/framework usage details and code examples.
4. Use `agentic-search` for wide landscape scans and community pain-point research.
5. Summarize trade-offs briefly → choose one approach → implement one tracer-bullet slice.

## Change Checklist

Before finishing any change:
1. `bun run i18n:check && bun run typecheck && bun run lint && bun run test`
2. If backend changed: `bunx convex codegen`
3. Summarize behavior changes and trade-offs in your response.
4. List remaining risks and follow-ups explicitly.
