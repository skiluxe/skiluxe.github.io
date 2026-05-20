// Emit RFC5545 VCALENDAR from bookings.

import type { Booking } from "../types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function nowStamp(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function dateOnly(s: string): string {
  return s.replace(/-/g, "");
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (i === 0) out.push(line.slice(i, i + 75));
    else out.push(" " + line.slice(i, i + 74));
    i = out.length === 1 ? 75 : i + 74;
  }
  return out.join("\r\n");
}

function escapeText(t: string): string {
  return t
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function emitIcal(bookings: Booking[], opts: { slug: string; domain: string }): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//SkiLuxe New Gudauri//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push(`X-WR-CALNAME:SkiLuxe ${opts.slug}`);
  lines.push("METHOD:PUBLISH");
  const stamp = nowStamp();
  for (const b of bookings) {
    const summary = b.status === "confirmed" ? "Booked" : "Held";
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:booking-${b.id}@${opts.domain}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(b.checkin)}`);
    lines.push(`DTEND;VALUE=DATE:${dateOnly(b.checkout)}`);
    lines.push(fold(`SUMMARY:${escapeText(summary)}`));
    lines.push(`STATUS:${b.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`);
    lines.push("TRANSP:OPAQUE");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
