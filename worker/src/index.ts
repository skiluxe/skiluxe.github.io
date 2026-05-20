import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";
import { icalRoutes } from "./routes/ical";
import { syncAllSources } from "./jobs/sync-ical";
import { expireHolds } from "./jobs/expire-holds";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const env = c.env;
  const origin = c.req.header("Origin") || "";
  const allowed = new Set<string>([env.SITE_ORIGIN, env.ALT_SITE_ORIGIN].filter(Boolean));
  // In dev allow localhost too
  if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) allowed.add(origin);
  const isAllowed = allowed.has(origin);
  return cors({
    origin: isAllowed ? origin : env.SITE_ORIGIN,
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })(c, next);
});

app.get("/", (c) => c.json({ ok: true, service: "skiluxe-api" }));
app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.route("/api", publicRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/ical", icalRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("Unhandled:", err);
  return c.json({ error: "internal_error" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const cron = event.cron;
    if (cron === "*/15 * * * *") {
      ctx.waitUntil(syncAllSources(env).then((r) => console.log("iCal sync:", r)));
    }
    if (cron === "*/5 * * * *") {
      ctx.waitUntil(expireHolds(env).then((r) => console.log("Expire holds:", r)));
    }
  },
};
