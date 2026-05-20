// Minimal RFC5545 parser. Booking.com / Airbnb iCal feeds use simple VEVENTs with DTSTART;VALUE=DATE.
// We only need: UID, SUMMARY, DTSTART, DTEND. Folding (long lines) and timezone-naive dates handled.

export interface ParsedEvent {
  uid: string;
  start_date: string; // YYYY-MM-DD (inclusive)
  end_date: string;   // YYYY-MM-DD (exclusive)
  summary: string;
}

export function parseIcal(text: string): ParsedEvent[] {
  const unfolded = unfold(text);
  const lines = unfolded.split(/\r?\n/);
  const events: ParsedEvent[] = [];
  let current: Partial<ParsedEvent> | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current && current.uid && current.start_date && current.end_date) {
        events.push({
          uid: current.uid,
          start_date: current.start_date,
          end_date: current.end_date,
          summary: current.summary || "",
        });
      }
      current = null;
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const left = line.slice(0, colon);
      const value = line.slice(colon + 1);
      const semi = left.indexOf(";");
      const name = (semi >= 0 ? left.slice(0, semi) : left).toUpperCase();
      if (name === "UID") current.uid = value;
      else if (name === "SUMMARY") current.summary = unescape(value);
      else if (name === "DTSTART") current.start_date = parseDateValue(value);
      else if (name === "DTEND") current.end_date = parseDateValue(value);
    }
  }
  return events;
}

function unfold(text: string): string {
  // RFC5545 line folding: continuation lines start with a space or tab.
  return text.replace(/\r?\n[ \t]/g, "");
}

function parseDateValue(v: string): string {
  // Either YYYYMMDD (VALUE=DATE) or YYYYMMDDTHHMMSSZ (UTC datetime).
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function unescape(v: string): string {
  return v.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
}
