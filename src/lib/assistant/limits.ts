/**
 * Best-effort request limiter.
 * shortcut: per-instance memory, so it resets on cold starts and is not shared
 * across serverless instances; upgrade to a durable store (needs approval) if
 * the beta shows abuse. OpenRouter's account quota remains the hard ceiling.
 */
export interface LimitDecision { allowed: boolean; retryAfterSeconds?: number; scope?: "user" | "service" }

export function createLimiter(options: { perUser: number; windowMs: number; perDay: number }, now = () => Date.now()) {
  const recent = new Map<string, number[]>();
  let day = "";
  let dayCount = 0;
  return {
    take(userId: string): LimitDecision {
      const time = now();
      const today = new Date(time).toISOString().slice(0, 10);
      if (today !== day) { day = today; dayCount = 0; }
      if (dayCount >= options.perDay) {
        const midnight = Date.parse(`${today}T00:00:00.000Z`) + 86_400_000;
        return { allowed: false, scope: "service", retryAfterSeconds: Math.ceil((midnight - time) / 1000) };
      }
      const window = (recent.get(userId) ?? []).filter((at) => time - at < options.windowMs);
      if (window.length >= options.perUser) {
        recent.set(userId, window);
        return { allowed: false, scope: "user", retryAfterSeconds: Math.ceil((window[0] + options.windowMs - time) / 1000) };
      }
      window.push(time);
      recent.set(userId, window);
      dayCount += 1;
      return { allowed: true };
    },
  };
}
