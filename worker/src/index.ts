import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";
import { icalRoutes } from "./routes/ical";
import { paymentRoutes } from "./routes/payments";
import { syncAllSources } from "./jobs/sync-ical";
import { expireHolds } from "./jobs/expire-holds";
import { isPasswordHashFormat } from "./lib/auth";
import { testTbcCredentials } from "./lib/tbc-pay";
import { testGeopayCredentials } from "./lib/geopay";

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
app.get("/health/admin-auth", async (c) => {
  const raw = c.env.ADMIN_PASSWORD_HASH ?? "";
  return c.json({
    configured: !!raw,
    formatOk: raw ? isPasswordHashFormat(raw) : false,
    storedLength: raw.length,
    encoding: raw.startsWith("pbkdf2$") ? "raw" : "base64",
  });
});

app.get("/health/geopay", async (c) => {
  const result = await testGeopayCredentials(c.env);
  return c.json(result, result.redirectOk ? 200 : 503);
});

app.get("/health/tbc", async (c) => {
  const result = await testTbcCredentials(c.env);
  return c.json(result, result.tokenOk ? 200 : 503);
});

app.route("/api", publicRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/ical", icalRoutes);
app.route("/api/payments", paymentRoutes);

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
