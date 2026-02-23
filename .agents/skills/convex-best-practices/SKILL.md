---
name: convex-best-practices
description: Guidelines for building production-ready Convex apps covering function organization, query patterns, validation, TypeScript usage, error handling, and the Zen of Convex design philosophy
---

# Convex Best Practices

Build production-ready Convex applications by following established patterns for function organization, query optimization, validation, TypeScript usage, and error handling.

## Code Quality

All patterns in this skill comply with `@convex-dev/eslint-plugin`. Install it for build-time validation:

```bash
npm i @convex-dev/eslint-plugin --save-dev
```

```js
// eslint.config.js
import { defineConfig } from "eslint/config";
import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([
  ...convexPlugin.configs.recommended,
]);
```

The plugin enforces four rules:

| Rule                                | What it enforces                  |
| ----------------------------------- | --------------------------------- |
| `no-old-registered-function-syntax` | Object syntax with `handler`      |
| `require-argument-validators`       | `args: {}` on all functions       |
| `explicit-table-ids`                | Table name in db operations       |
| `import-wrong-runtime`              | No Node imports in Convex runtime |

Docs: https://docs.convex.dev/eslint

## Documentation Sources

Before implementing, do not assume; fetch the latest documentation:

- Primary: https://docs.convex.dev/understanding/best-practices/
- Error Handling: https://docs.convex.dev/functions/error-handling
- Write Conflicts: https://docs.convex.dev/error#1
- For broader context: https://docs.convex.dev/llms.txt

## Instructions

### The Zen of Convex

1. **Convex manages the hard parts** - Let Convex handle caching, real-time sync, and consistency
2. **Functions are the API** - Design your functions as your application's interface
3. **Schema is truth** - Define your data model explicitly in schema.ts
4. **TypeScript everywhere** - Leverage end-to-end type safety
5. **Queries are reactive** - Think in terms of subscriptions, not requests

---

## Three-Layer Architecture (Established Pattern)

All backend domains in this codebase follow a strict three-layer layout. Never collapse layers or put logic in the wrong one.

```
convex/
  lib/
    dateUtils.ts          # Pure TS — no ctx, no _generated imports (type-only ok)
    slotEngine.ts         # Pure TS — domain logic with no DB access
    setupValidation.ts    # Pure TS — validation logic, no Convex runtime
    schedulingError.ts    # Domain error helper (thin ConvexError wrapper)
  model/
    clinics.ts            # Entity helpers for clinics (getBySlug, assertOwner…)
    providers.ts          # Entity helpers for providers
    scheduling.ts         # Scheduling domain handlers + composite resolvers
    setup.ts              # Setup domain handlers
  scheduling.ts           # Thin API wrappers: query()/mutation() + v. validators only
  setup.ts                # Thin API wrappers only
  schema.ts               # Single source of truth for all tables
  http.ts                 # All httpAction endpoints (singleton)
  crons.ts                # All recurring jobs (singleton)
```

### Layer Rules

| Layer | Contains | Imports allowed |
|---|---|---|
| `lib/` | Pure functions, validation, formatters, domain error helpers | `convex/values`, `import type` from `_generated`, `shared/` |
| `model/` | Handlers, composite resolvers, DB access helpers | Everything above + `_generated/server`, `lib/` files |
| Root (`domain.ts`) | `query()`, `mutation()`, `internalQuery()` wrappers + `v.` validators | `model/` handlers, `_generated/server` |

**Never put real logic in the root API file.** The handler should be one line:
```ts
handler: async (ctx, args) => myHandler(ctx, args),
```

**Never import model files from lib files.** Data flows one way: lib ← model ← API wrapper.

**Tests import from `model/`, not from the root API file.**
```ts
// CORRECT
import { createAppointmentForOwnerHandler } from "./model/scheduling";

// WRONG — tests should not go through the Convex wrapper layer
import { createAppointmentForOwnerHandler } from "./scheduling";
```

### Entity Files in `model/`

Entity-specific DB helpers belong in their own file, not inside a domain model file:

```ts
// convex/model/clinics.ts — NOT inside model/scheduling.ts
export async function getClinicBySlugOrThrow(
  ctx: QueryCtx | MutationCtx,
  slug: string,
): Promise<Doc<"clinics">> {
  const clinic = await ctx.db
    .query("clinics")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!clinic) schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  return clinic;
}

export function assertClinicOwner(clinic: Doc<"clinics">, subject: string): void {
  if (clinic.createdBySubject !== subject) {
    schedulingError(SCHEDULING_ERROR_CODES.FORBIDDEN);
  }
}
```

**Rule:** if two different domain handlers need to look up the same entity, the helper belongs in an entity file, not in either domain file.

### Composite Resolvers — Auth + DB Together

Mixing auth checks with DB access in one composite function is intentional and correct. It prevents callers from accidentally fetching data without the auth check:

```ts
// CORRECT — auth and DB access are inseparable here by design
async function resolveClinicProviderForOwner(
  ctx: QueryCtx | MutationCtx,
  args: { clinicSlug: string; providerName: string },
) {
  const identity = await requireIdentity(ctx);
  const clinic = await getClinicBySlugOrThrow(ctx, clinicSlug);
  assertClinicOwner(clinic, identity.subject);  // must follow fetch, not precede
  const provider = await getProviderByNameOrThrow(ctx, clinic._id, providerName);
  return { clinic, provider };
}

// WRONG — separating these creates a footgun where DB access happens without auth
async function getClinicForOwner(ctx, slug) { ... }       // no auth
async function checkOwnership(identity, clinic) { ... }   // too late to be safe
```

### Pure Utility Files in `lib/`

If a file has zero Convex runtime imports (only `import type` from `_generated/dataModel`), it belongs in `lib/`, not in the `convex/` root or `model/`:

```ts
// convex/lib/dateUtils.ts — pure functions, no ctx
import type { Doc } from "../_generated/dataModel"; // type-only: OK

export function parseDateLocal(dateLocal: string): ParsedLocalDate | null { ... }
export function combineLocalDateMinuteToUtcMs(
  dateLocal: string,
  minuteOfDay: number,
  timezone: Doc<"clinics">["timezone"], // type-only reference: OK
): number | null { ... }
```

Convex scans all `convex/*.ts` files for functions to register. Files in `convex/lib/` and `convex/model/` are not scanned directly — they're only reachable via imports. This keeps `_generated/api.d.ts` clean.

### Domain Error Helpers

Each domain has a thin error helper in `lib/` rather than repeating `throw new ConvexError(...)` everywhere:

```ts
// convex/lib/schedulingError.ts
import { ConvexError } from "convex/values";
import type { SCHEDULING_ERROR_CODES } from "../../shared/schedulingErrorCodes";

export function schedulingError(
  code: (typeof SCHEDULING_ERROR_CODES)[keyof typeof SCHEDULING_ERROR_CODES],
  details?: Record<string, string | number | boolean>,
): never {
  throw new ConvexError({ code, ...details });
}
```

Domains with complex validation errors (like setup) use a `try/catch` + converter pattern instead:

```ts
// convex/model/setup.ts
function asConvexError(error: unknown) {
  if (error instanceof ConvexError) return error;
  if (error instanceof SetupValidationError) return new ConvexError({ code: error.code });
  return new ConvexError({ code: SETUP_ERROR_CODES.INVALID_PAYLOAD });
}
```

### Two Validation Layers — Both Needed

`v.` validators at the API boundary and business rule assertions in the model layer validate **different things**:

| Layer | Validates | Example |
|---|---|---|
| `v.number()` in args | Is this a JavaScript number? | Passes `3.7`, `-1`, `NaN` |
| `assertPositiveInteger()` in model | Is this a valid business value? | Rejects `3.7`, `-1`, `NaN` |

Do NOT use Zod/Valibot. Convex's `v.` system handles type validation. The model layer handles business invariants with `ConvexError` so structured error codes flow through to frontend i18n mapping.

### `sanitizeAvailabilityLimit` pattern — default must be explicit

When a function has an optional numeric argument with a default:

```ts
// CORRECT — default is explicit, undefined handling is visible
function sanitizeAvailabilityLimit(limit: number | undefined) {
  const resolved = limit ?? 10;
  assertPositiveInteger(resolved, "limit");
  return Math.min(resolved, 50);
}

// WRONG — default parameter never fires when called with `args.limit`
//          which is typed `number | undefined`, not missing
function sanitizeAvailabilityLimit(limit: number = 10) { ... }
```

---

### Function Organization

Organize your Convex functions by domain:

```typescript
// convex/users.ts - User-related functions
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.string(),
      email: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get("users", args.userId);
  },
});
```

### Argument and Return Validation

Always define validators for arguments AND return types:

```typescript
export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      priority: args.priority,
      completed: false,
      createdAt: Date.now(),
    });
  },
});
```

### Query Patterns

Use indexes instead of filters for efficient queries:

```typescript
// Schema with index
export default defineSchema({
  tasks: defineTable({
    userId: v.id("users"),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"]),
});

// Query using index
export const getTasksByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});
```

### Error Handling

Use ConvexError for user-facing errors. Always use structured error codes (objects), never plain strings — plain strings cannot be mapped to i18n keys:

```typescript
import { ConvexError } from "convex/values";

// CORRECT — structured code that frontend can map to i18n
throw new ConvexError({ code: "NOT_FOUND" });

// WRONG — plain string cannot be programmatically mapped
throw new ConvexError("Task not found");
```

### Avoiding Write Conflicts (Optimistic Concurrency Control)

Convex uses OCC. Follow these patterns to minimize conflicts:

```typescript
// GOOD: Make mutations idempotent
export const completeTask = mutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);

    // Early return if already complete (idempotent)
    if (!task || task.status === "completed") {
      return null;
    }

    await ctx.db.patch("tasks", args.taskId, {
      status: "completed",
      completedAt: Date.now(),
    });
    return null;
  },
});

// GOOD: Use Promise.all for parallel independent updates
export const reorderItems = mutation({
  args: { itemIds: v.array(v.id("items")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates = args.itemIds.map((id, index) =>
      ctx.db.patch("items", id, { order: index }),
    );
    await Promise.all(updates);
    return null;
  },
});
```

### TypeScript Best Practices

```typescript
import { Id, Doc } from "./_generated/dataModel";

// Use Id type for document references
type UserId = Id<"users">;

// Use Doc type for full documents
type User = Doc<"users">;
```

### Internal vs Public Functions

```typescript
// Public function - exposed to clients, must have full v. validation and auth
export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => { ... },
});

// Internal function - only callable from other Convex functions
// Can relax validation since clients cannot reach it
export const _updateUserStats = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => { ... },
});
```

## Examples

### Complete CRUD Pattern

```typescript
// convex/tasks.ts — thin API layer only
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  listTasksHandler,
  createTaskHandler,
  updateTaskHandler,
  removeTaskHandler,
} from "./model/tasks";

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => listTasksHandler(ctx, args),
});

export const create = mutation({
  args: { title: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => createTaskHandler(ctx, args),
});

// convex/model/tasks.ts — real logic
export async function listTasksHandler(
  ctx: QueryCtx,
  args: { userId: Id<"users"> },
) {
  return await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .collect();
}
```

## Best Practices

- Never run `npx convex deploy` unless explicitly instructed
- Never run any git commands unless explicitly instructed
- Always define return validators for functions
- Use indexes for all queries that filter data
- Make mutations idempotent to handle retries gracefully
- Use ConvexError with structured codes (objects) for user-facing errors — never plain strings
- Organize functions by domain, follow the three-layer architecture
- Use internal functions for sensitive operations
- Leverage TypeScript's Id and Doc types
- `http.ts` and `crons.ts` are always singletons — all HTTP actions go in one, all crons in one

## Common Pitfalls

1. **Using filter instead of withIndex** - Always define indexes and use withIndex
2. **Missing return validators** - Always specify the returns field
3. **Non-idempotent mutations** - Check current state before updating
4. **Logic in the root API file** - Root files are wrappers only; logic goes in `model/`
5. **Entity helpers inside domain model files** - If two domains need the same entity lookup, it belongs in `model/clinics.ts` or `model/providers.ts`, not duplicated
6. **Validation helpers in lib/ calling Convex runtime** - `lib/` files must be pure TS; only `import type` from `_generated` is allowed
7. **Plain string ConvexError** - Always use `{ code: "..." }` object so frontend can map to i18n
8. **Default parameter instead of `?? default`** - Optional number args typed as `number = 10` hide undefined; use `number | undefined` + `?? 10` inside

## References

- Convex Documentation: https://docs.convex.dev/
- Convex LLMs.txt: https://docs.convex.dev/llms.txt
- Best Practices: https://docs.convex.dev/understanding/best-practices/
- Error Handling: https://docs.convex.dev/functions/error-handling
- Write Conflicts: https://docs.convex.dev/error#1
