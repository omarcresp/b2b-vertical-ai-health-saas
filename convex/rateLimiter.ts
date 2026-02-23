import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  mutationGlobal: {
    kind: "fixed window",
    period: MINUTE,
    rate: 120,
  },
  mutationPerUser: {
    kind: "token bucket",
    period: MINUTE,
    rate: 30,
    capacity: 10,
  },
});
