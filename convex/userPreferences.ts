import { ConvexError, v } from "convex/values";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../shared/locales";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";

const [EN_US_LOCALE, ES_MX_LOCALE, ES_CO_LOCALE] = SUPPORTED_LOCALES;

const localeValidator = v.union(
  v.literal(EN_US_LOCALE),
  v.literal(ES_MX_LOCALE),
  v.literal(ES_CO_LOCALE),
);

export function assertSupportedLocale(
  locale: string,
): asserts locale is SupportedLocale {
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    throw new ConvexError("Invalid locale.");
  }
}

export async function getMyPreferencesHandler(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Authentication is required.");
  }

  const preferences = await ctx.db
    .query("userPreferences")
    .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
    .unique();

  if (!preferences) {
    return null;
  }

  return {
    locale: preferences.locale,
  };
}

export async function setMyLocaleHandler(
  ctx: MutationCtx,
  args: { locale: SupportedLocale },
) {
  assertSupportedLocale(args.locale);

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Authentication is required.");
  }

  const existing = await ctx.db
    .query("userPreferences")
    .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
    .unique();

  const updatedAtUtcMs = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      locale: args.locale,
      updatedAtUtcMs,
    });
    return { locale: args.locale };
  }

  await ctx.db.insert("userPreferences", {
    subject: identity.subject,
    locale: args.locale,
    updatedAtUtcMs,
  });

  return { locale: args.locale };
}

export const getMyPreferences = query({
  args: {},
  handler: async (ctx) => getMyPreferencesHandler(ctx),
});

export const setMyLocale = mutation({
  args: {
    locale: localeValidator,
  },
  handler: async (ctx, args) => setMyLocaleHandler(ctx, args),
});
