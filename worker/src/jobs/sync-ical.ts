import type { Env } from "../types";
import { parseIcal } from "../lib/ical-parser";
import { audit } from "../lib/db";

export async function syncAllSources(env: Env): Promise<{ synced: number; errors: number }> {
  const { results } = await env.DB.prepare("SELECT id FROM ical_sources WHERE active = 1").all<{ id: number }>();
  let synced = 0;
  let errors = 0;
  for (const row of results || []) {
    const r = await syncOneSource(env, row.id);
    if (r.ok) synced++; else errors++;
  }
  return { synced, errors };
}

export async function syncOneSource(env: Env, sourceId: number): Promise<{ ok: boolean; events?: number; error?: string }> {
  const source = await env.DB.prepare("SELECT * FROM ical_sources WHERE id = ?")
    .bind(sourceId)
    .first<{ id: number; apartment_id: number; url: string }>();
  if (!source) return { ok: false, error: "source_not_found" };

  try {
    const cacheKey = `ical_cache:${source.id}`;
    const cached = await env.KV.get(cacheKey, "json") as { etag?: string; body?: string } | null;
    const headers: Record<string, string> = {};
    if (cached?.etag) headers["If-None-Match"] = cached.etag;
    const res = await fetch(source.url, { headers });
    if (res.status === 304 && cached?.body) {
      await markSynced(env, sourceId, "ok (304)");
      return { ok: true, events: -1 };
    }
    if (!res.ok) {
      await markSynced(env, sourceId, `error: HTTP ${res.status}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const body = await res.text();
    const etag = res.headers.get("ETag") || "";
    await env.KV.put(cacheKey, JSON.stringify({ etag, body: body.slice(0, 200000) }), { expirationTtl: 3600 });

    const events = parseIcal(body);
    const seenUids = new Set<string>();
    for (const ev of events) {
      if (!ev.uid || !ev.start_date || !ev.end_date) continue;
      seenUids.add(ev.uid);
      await env.DB.prepare(
        `INSERT INTO ical_events (source_id, apartment_id, uid, start_date, end_date, summary, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id, uid) DO UPDATE SET
           start_date = excluded.start_date,
           end_date = excluded.end_date,
           summary = excluded.summary,
           fetched_at = excluded.fetched_at`
      ).bind(source.id, source.apartment_id, ev.uid, ev.start_date, ev.end_date, ev.summary, Date.now()).run();
    }
    // Delete events from this source whose UID is no longer present (cancellations on Booking.com side).
    if (seenUids.size > 0) {
      const placeholders = Array.from(seenUids).map(() => "?").join(",");
      await env.DB.prepare(
        `DELETE FROM ical_events WHERE source_id = ? AND uid NOT IN (${placeholders})`
      ).bind(source.id, ...Array.from(seenUids)).run();
    } else {
      await env.DB.prepare("DELETE FROM ical_events WHERE source_id = ?").bind(source.id).run();
    }
    await markSynced(env, sourceId, "ok");
    await audit(env.DB, "system", "ical.sync", "ical_sources", sourceId, { events: events.length });
    return { ok: true, events: events.length };
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 200);
    await markSynced(env, sourceId, `error: ${msg}`);
    return { ok: false, error: msg };
  }
}

async function markSynced(env: Env, id: number, status: string) {
  await env.DB.prepare("UPDATE ical_sources SET last_synced_at = ?, last_status = ? WHERE id = ?")
    .bind(Date.now(), status, id)
    .run();
}
