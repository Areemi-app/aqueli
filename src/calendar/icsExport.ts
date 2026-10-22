/**
 * Export du calendrier au format .ics (iCalendar), lu par Google Agenda, Outlook et Apple
 * Calendrier (cahier des charges § 4.3) : titre, lieu, notes, dates et heures, répétition,
 * occurrences retirées et rappel. Les heures sont écrites en heure locale. Fonctions pures.
 */
import { addDays, type DayKey } from "../tasks/day";
import type { Recurrence } from "../tasks/recurrence";
import type { CalendarEvent } from "./events";

const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Ligne repliée à 75 octets (suite précédée d'une espace). */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const date = (day: DayKey) => day.replace(/-/g, "");
const dateTime = (day: DayKey, time: string) => `${date(day)}T${time.replace(":", "")}00`;
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Règle RRULE d'une répétition ; `null` : sans équivalent (après achèvement, propre aux tâches). */
export function ruleOf(r: Recurrence): string | null {
  const every = (n: number) => (n > 1 ? `;INTERVAL=${n}` : "");
  switch (r.kind) {
    case "daily":
      return `FREQ=DAILY${every(r.interval)}`;
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly":
      return `FREQ=WEEKLY${every(r.interval)};BYDAY=${r.days.map((d) => DAYS[d]).join(",")}`;
    case "monthly":
      return `FREQ=MONTHLY${every(r.interval)};BYMONTHDAY=${r.day}`;
    case "monthlyNth":
      return `FREQ=MONTHLY${every(r.interval)};BYDAY=${r.nth}${DAYS[r.weekday]}`;
    case "yearly":
      return `FREQ=YEARLY${every(r.interval)};BYMONTH=${r.month};BYMONTHDAY=${r.day}`;
    default:
      return null;
  }
}

/** Fichier .ics des événements ; `now` : instant de l'export (DTSTAMP). */
export function toIcs(events: readonly CalendarEvent[], now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Aqueli//Calendrier//FR", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    const timed = e.startTime !== null;
    lines.push("BEGIN:VEVENT", `UID:${e.id}@aqueli`, `DTSTAMP:${stamp}`, `SUMMARY:${escape(e.title)}`);
    if (timed) {
      lines.push(`DTSTART:${dateTime(e.startDate, e.startTime!)}`, `DTEND:${dateTime(e.endDate, e.endTime ?? e.startTime!)}`);
    } else {
      // Journée entière : la fin d'iCalendar est le lendemain du dernier jour.
      lines.push(`DTSTART;VALUE=DATE:${date(e.startDate)}`, `DTEND;VALUE=DATE:${date(addDays(e.endDate, 1))}`);
    }
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${escape(e.notes)}`);
    const rule = e.recurrence ? ruleOf(e.recurrence) : null;
    if (rule) {
      const until = e.repeatUntil ? `;UNTIL=${timed ? `${date(e.repeatUntil)}T235959` : date(e.repeatUntil)}` : "";
      lines.push(`RRULE:${rule}${until}`);
      for (const day of e.exceptions) lines.push(timed ? `EXDATE:${dateTime(day, e.startTime!)}` : `EXDATE;VALUE=DATE:${date(day)}`);
    }
    if (e.reminder !== null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escape(e.title)}`, `TRIGGER:-PT${e.reminder}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
