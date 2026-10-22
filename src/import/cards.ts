/**
 * Fichiers d'agenda (.ics, iCalendar) et de contacts (.vcf, vCard) exportés par Outlook, Google,
 * Apple ou un téléphone : chaque VEVENT devient un événement, chaque VCARD un contact, sous forme
 * d'enregistrements bruts vérifiés ensuite comme les lignes d'un tableau (records.ts).
 * Fonctions pures.
 */
import { addDays, makeDay, type DayKey } from "../tasks/day";
import type { RawRecord } from "./lines";
import { tr } from "../i18n/i18n";

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
  /** Ligne du fichier où commence la propriété. */
  line: number;
}

/** Lignes dépliées (une ligne qui commence par une espace prolonge la précédente). */
function unfold(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  text.split(/\r\n|\n|\r/).forEach((raw, i) => {
    const last = out[out.length - 1];
    if (last && (raw.startsWith(" ") || raw.startsWith("\t"))) last.text += raw.slice(1);
    // vCard 2.1 en « quoted-printable » : « = » en fin de ligne prolonge la ligne.
    else if (last && /ENCODING=QUOTED-PRINTABLE/i.test(last.text.split(":")[0] ?? "") && last.text.endsWith("=")) last.text = last.text.slice(0, -1) + raw;
    else out.push({ line: i + 1, text: raw });
  });
  return out;
}

function parseLine(line: number, text: string): Property | null {
  // Le nom et les paramètres s'arrêtent au premier « : » hors guillemets.
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (text[i] === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const [rawName = "", ...rawParams] = text.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
    // vCard 2.1 : « TEL;CELL;VOICE: » (type sans « TYPE= »).
    else params.TYPE = params.TYPE ? `${params.TYPE},${p}` : p;
  }
  // « item1.EMAIL » (Apple) : le groupe est ignoré.
  const name = rawName.replace(/^[^.]*\./, "").toUpperCase();
  return { name, params, value: text.slice(colon + 1), line };
}

/** Valeur brute, « quoted-printable » décodé (vCard 2.1). */
function decoded(p: Property): string {
  const v = p.value;
  if ((p.params.ENCODING ?? "").toUpperCase() !== "QUOTED-PRINTABLE") return v;
  const bytes: number[] = [];
  for (let i = 0; i < v.length; i++) {
    if (v[i] === "=" && /^[0-9A-F]{2}$/i.test(v.slice(i + 1, i + 3))) {
      bytes.push(parseInt(v.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...new TextEncoder().encode(v[i]!));
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

const unescape = (v: string) => v.replace(/\\[nN]/g, "\n").replace(/\\([,;\\])/g, "$1");

/** Texte d'une valeur : « \n », « \, » et « \; » rendus. */
const textOf = (p: Property) => unescape(decoded(p));

/** Composants d'une valeur structurée (« N:Durand;Paul;;; »), séparés par « ; » non échappés. */
const parts = (p: Property) =>
  decoded(p)
    .split(/(?<!\\);/)
    .map((s) => unescape(s).trim());

/** Blocs « BEGIN:VEVENT … END:VEVENT » (sans les blocs imbriqués comme VALARM). */
function blocks(text: string, kind: string): Property[][] {
  const out: Property[][] = [];
  let current: Property[] | null = null;
  let depth = 0;
  for (const { line, text: t } of unfold(text)) {
    const p = parseLine(line, t);
    if (!p) continue;
    if (p.name === "BEGIN") {
      if (p.value.toUpperCase() === kind && current === null) {
        current = [p];
        depth = 0;
      } else if (current) {
        depth += 1;
        current.push(p);
      }
    } else if (p.name === "END" && current) {
      if (depth === 0 && p.value.toUpperCase() === kind) {
        out.push(current);
        current = null;
      } else {
        depth -= 1;
        current.push(p);
      }
    } else current?.push(p);
  }
  return out;
}

const two = (n: number) => String(n).padStart(2, "0");
const frDay = (day: DayKey) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

interface IcsTime {
  day: DayKey;
  /** « HH:MM » ; nul pour une journée entière. */
  time: string | null;
}

/** Date d'iCalendar : « 20261008 », « 20261008T093000 » (heure locale), « 20261008T073000Z » (UTC). */
function icsTime(p: Property | undefined): IcsTime | null {
  if (!p) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(p.value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , utc] = m;
  if (h === undefined) {
    const day = makeDay(Number(y), Number(mo), Number(d));
    return day ? { day, time: null } : null;
  }
  if (utc) {
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
    const day = makeDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return day ? { day, time: `${two(date.getHours())}:${two(date.getMinutes())}` } : null;
  }
  // Heure locale ou fuseau nommé (TZID) : gardée telle quelle.
  const day = makeDay(Number(y), Number(mo), Number(d));
  return day ? { day, time: `${h}:${mi}` } : null;
}

const ICS_DAYS: Record<string, string> = { MO: "lundi", TU: "mardi", WE: "mercredi", TH: "jeudi", FR: "vendredi", SA: "samedi", SU: "dimanche" };
const NTH_WORDS: Record<string, string> = { "1": "1er", "2": "2e", "3": "3e", "4": "4e", "-1": "dernier" };

/** Répétition d'iCalendar (RRULE) en français, comme dans un tableau ; `null` : non reconnue. */
export function repeatFromRule(rule: string): string | null {
  const r = Object.fromEntries(rule.split(";").map((kv) => kv.split("=") as [string, string]).map(([k, v]) => [k.toUpperCase(), (v ?? "").toUpperCase()]));
  const n = r.INTERVAL ? Number(r.INTERVAL) : 1;
  if (!Number.isInteger(n) || n < 1 || r.BYSETPOS || r.BYHOUR) return null;
  const days = (r.BYDAY ?? "").split(",").filter(Boolean);
  switch (r.FREQ) {
    case "DAILY":
      return n === 1 ? "chaque jour" : `tous les ${n} jours`;
    case "WEEKLY": {
      const names = days.map((d) => ICS_DAYS[d]);
      if (names.some((x) => !x)) return null;
      if (days.length === 0) return n === 1 ? "chaque semaine" : `toutes les ${n} semaines`;
      if (n === 1) return `chaque ${names.join(" et ")}`;
      return days.length === 1 ? `tous les ${n} ${names[0]}s` : null;
    }
    case "MONTHLY": {
      if (days.length === 0) return n === 1 ? "chaque mois" : `tous les ${n} mois`;
      const m = days.length === 1 ? /^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(days[0]!) : null;
      const nth = m?.[1] ? NTH_WORDS[String(Number(m[1]))] : undefined;
      return m && nth && n === 1 ? `le ${nth} ${ICS_DAYS[m[2]!]} du mois` : null;
    }
    case "YEARLY":
      return n === 1 && days.length === 0 ? "chaque année" : null;
    default:
      return null;
  }
}

/** Rappel d'iCalendar (« -PT15M », « -P1D ») en texte (« 15 min », « 1 j »). */
function reminderFromTrigger(trigger: string): string | null {
  const m = /^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(trigger.trim());
  if (!m) return null;
  const minutes = Number(m[1] ?? 0) * 10080 + Number(m[2] ?? 0) * 1440 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  if (minutes === 0) return "à l'heure";
  if (minutes % 1440 === 0) return `${minutes / 1440} j`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

/** Événements d'un fichier .ics ; les événements annulés sont ignorés. */
/** Identifiant d'un élément exporté par Aqueli (« UID:<id>@aqueli ») ; `null` pour un autre logiciel. */
function aqueliId(uid: { value: string } | undefined): string | null {
  const m = /^([A-Za-z0-9_-]{1,64})@aqueli$/.exec(uid?.value.trim() ?? "");
  return m ? m[1]! : null;
}

export function icsRecords(text: string): RawRecord[] {
  return blocks(text, "VEVENT").flatMap((props) => {
    const get = (name: string) => props.find((p) => p.name === name);
    if ((get("STATUS")?.value ?? "").toUpperCase() === "CANCELLED") return [];
    // Occurrence modifiée d'une série (RECURRENCE-ID) : ignorée, la série la porte déjà.
    if (get("RECURRENCE-ID")) return [];
    const record: RawRecord = { line: props[0]!.line, kind: "event", fields: {}, extra: [] };
    const id = aqueliId(get("UID"));
    if (id) record.fields.id = id;
    const summary = get("SUMMARY");
    if (summary) record.fields.title = textOf(summary).replace(/\s+/g, " ").trim();
    const start = icsTime(get("DTSTART"));
    let end = icsTime(get("DTEND"));
    const duration = get("DURATION");
    if (start) {
      record.fields.date = frDay(start.day);
      if (start.time) record.fields.start = start.time;
      if (!end && duration && start.time) {
        const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(duration.value.trim());
        if (m) {
          const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Number(start.time.slice(0, 2)) * 60 + Number(start.time.slice(3));
          end = { day: addDays(start.day, Math.floor(total / 1440)), time: `${two(Math.floor((total % 1440) / 60))}:${two(total % 60)}` };
        }
      }
      if (end) {
        if (start.time && end.time) {
          record.fields.end = end.time;
          if (end.day !== start.day) record.fields.endDate = frDay(end.day);
        } else if (!start.time) {
          // Journée entière : la fin d'iCalendar est le lendemain du dernier jour.
          const last = addDays(end.day, -1);
          if (last > start.day) record.fields.endDate = frDay(last);
        }
      }
    }
    const location = get("LOCATION");
    if (location) record.fields.location = textOf(location).replace(/\s+/g, " ").trim();
    const description = get("DESCRIPTION");
    if (description) record.fields.notes = textOf(description).trim();
    const rule = get("RRULE");
    if (rule) {
      const repeat = repeatFromRule(rule.value);
      if (repeat) record.fields.repeat = repeat;
      else record.notices = [tr("Répétition non reprise : à régler dans le calendrier.")];
    }
    const trigger = props.find((p) => p.name === "TRIGGER");
    const reminder = trigger ? reminderFromTrigger(trigger.value) : null;
    if (reminder) record.fields.reminder = reminder;
    return [record];
  });
}

/** Anniversaire de vCard (« 1990-05-14 », « 19900514 », « --0514 », « --05-14 ») au format français. */
function birthdayOf(value: string): string | null {
  const v = value.trim().replace(/T.*$/, "");
  let m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v);
  if (m) return m[1] === "1604" ? `${m[3]}/${m[2]}` : `${m[3]}/${m[2]}/${m[1]}`;
  m = /^--(\d{2})-?(\d{2})$/.exec(v);
  return m ? `${m[2]}/${m[1]}` : null;
}

/** Contacts d'un fichier .vcf. */
export function vcfRecords(text: string): RawRecord[] {
  return blocks(text, "VCARD").map((props) => {
    const all = (name: string) => props.filter((p) => p.name === name);
    const get = (name: string) => all(name)[0];
    const record: RawRecord = { line: props[0]!.line, kind: "contact", fields: {}, extra: [] };
    const id = aqueliId(get("UID"));
    if (id) record.fields.id = id;
    const n = get("N");
    if (n) {
      const [last = "", first = "", middle = ""] = parts(n);
      if (last) record.fields.lastName = last;
      const given = [first, middle].filter(Boolean).join(" ");
      if (given) record.fields.firstName = given;
    }
    const fn = get("FN");
    if (fn && !record.fields.firstName && !record.fields.lastName) record.fields.title = textOf(fn).trim();
    const org = get("ORG");
    if (org) record.fields.company = parts(org).filter(Boolean).join(", ");
    const phones = all("TEL").map((p) => textOf(p).replace(/^tel:/i, "").trim()).filter(Boolean);
    if (phones.length) record.fields.phone = phones.join("; ");
    const emails = all("EMAIL").map((p) => textOf(p).replace(/^mailto:/i, "").trim()).filter(Boolean);
    if (emails.length) record.fields.email = emails.join("; ");
    const adr = get("ADR");
    if (adr) {
      // Boîte postale ; complément ; rue ; ville ; région ; code postal ; pays.
      const [box = "", extended = "", street = "", city = "", region = "", code = "", country = ""] = parts(adr);
      record.fields.address = [box, extended, street, [code, city].filter(Boolean).join(" "), region, country].filter(Boolean).join("\n");
    }
    const bday = get("BDAY");
    if (bday) {
      const b = birthdayOf(bday.value);
      if (b) record.fields.birthday = b;
      else record.notices = [tr("Anniversaire illisible : « {value} ».", { value: bday.value.trim() })];
    }
    const note = get("NOTE");
    if (note) record.fields.notes = textOf(note).trim();
    const categories = get("CATEGORIES");
    if (categories) {
      // Étiquettes d'un seul mot : espaces et signes deviennent des tirets.
      const tags = textOf(categories)
        .split(/[,;]/)
        .map((t) => t.trim().replace(/[^\p{L}\p{N}_/-]+/gu, "-").replace(/^-+|-+$/g, ""))
        .filter((t) => t && !/^(?:mycontacts|starred)$/i.test(t));
      if (tags.length) record.fields.tags = tags.join(" ");
    }
    return record;
  });
}
