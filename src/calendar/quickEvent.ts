/**
 * Création d'un événement en une phrase (comme Google Agenda ou Fantastical) :
 * « Dîner avec Paul vendredi 20h », « Réunion lundi 14h-16h », « Dentiste le 15/11 à 9h30 +Santé »,
 * « Yoga chaque mardi 18h30 ». Sans heure, l'événement dure la journée ; sans date, il est
 * aujourd'hui. La date, l'heure, la répétition et l'espace se lisent comme dans la saisie
 * rapide des tâches, en français ou en anglais (« Dinner with Paul Friday 8pm »,
 * « Meeting Monday 2pm-4pm +Work »).
 */
import { dayKey, type DayKey } from "../tasks/day";
import { parseQuickAdd, type SpaceRef, type ContactRef } from "../tasks/quickAdd";
import type { Recurrence } from "../tasks/recurrence";
import { addMinutes } from "./eventTime";

export interface QuickEvent {
  title: string;
  startDate: DayKey;
  startTime: string | null;
  endDate: DayKey;
  endTime: string | null;
  recurrence: Recurrence | null;
  spaceId: string | null;
  /** Contacts cités par « @Paul ». */
  contactIds: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Heure sur 24 h depuis « 2 » et « pm » (« 12am » : minuit). */
const from12 = (hours: number, meridiem: string) => (hours % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);

/**
 * « 14h-16h », « de 9h30 à 11h », « 18:00 – 19:30 » ; en anglais « 2pm-4pm », « 2-4pm »,
 * « from 9:30am to 11am » : début et fin, retirés du texte.
 */
function takeRange(text: string): { rest: string; start: string; end: string } | null {
  const cut = (m: RegExpExecArray) => `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
  const valid = (h1: number, m1: string, h2: number, m2: string) => h1 <= 23 && h2 <= 23 && Number(m1) <= 59 && Number(m2) <= 59;
  const en = /(?:\bfrom\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s|$)/iu.exec(text);
  if (en) {
    const [s, sm = "00", sMer, e, em = "00", eMer = ""] = [Number(en[1]), en[2], en[3], Number(en[4]), en[5], en[6]];
    if (s >= 1 && s <= 12 && e >= 1 && e <= 12) {
      const end = from12(e, eMer);
      // « 2-4pm » : le début prend le même moment de la journée, sauf s'il tombait après la fin (« 11-1pm »).
      let start = from12(s, sMer ?? eMer);
      if (!sMer && start > end) start = from12(s, "am");
      if (valid(start, sm, end, em)) return { rest: cut(en), start: `${pad(start)}:${sm}`, end: `${pad(end)}:${em}` };
    }
  }
  const re = /(?:\b(?:de|from)\s+)?\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:-|–|à|to)\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?=\s|$)/iu;
  const m = re.exec(text);
  if (!m) return null;
  const [h1, m1 = "00", h2, m2 = "00"] = [Number(m[1]), m[2], Number(m[3]), m[4]];
  if (!valid(h1, m1, h2, m2)) return null;
  return { rest: cut(m), start: `${pad(h1)}:${m1}`, end: `${pad(h2)}:${m2}` };
}

export function parseQuickEvent(input: string, now: Date, spaces: readonly SpaceRef[], defaultDuration: number, contacts: readonly ContactRef[] = []): QuickEvent | null {
  const range = takeRange(input);
  const parsed = parseQuickAdd(range ? range.rest : input, now, spaces, contacts);
  const title = parsed.title.trim();
  if (!title) return null;
  const startDate = parsed.dueDate ?? dayKey(now);
  const startTime = range?.start ?? parsed.dueTime;
  if (!startTime) return { title, startDate, startTime: null, endDate: startDate, endTime: null, recurrence: parsed.recurrence, spaceId: parsed.spaceId, contactIds: parsed.contactIds };
  // Fin avant le début (« 23h-1h ») : le lendemain.
  const end = range ? (range.end > range.start ? { day: startDate, time: range.end } : addMinutes(startDate, range.end, 24 * 60)) : addMinutes(startDate, startTime, defaultDuration);
  return { title, startDate, startTime, endDate: end.day, endTime: end.time, recurrence: parsed.recurrence, spaceId: parsed.spaceId, contactIds: parsed.contactIds };
}
