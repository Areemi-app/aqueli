/**
 * Contacts côté interface (src-tauri/src/data/contacts.rs) : nom affiché, initiales, tri et
 * lettres, anniversaires (prochaine date, âge, ceux d'une période pour le calendrier).
 * Fonctions pures.
 */
import { fold } from "../lib/fold";
import type { ContactStyle } from "./cardStyles";
import { addDays, daysBetween, makeDay, type DayKey } from "../tasks/day";
import { fr, locale, tr } from "../i18n/i18n";

export interface Entry {
  label: string;
  value: string;
}

/** Information libre de la fiche (« Code d'entrée : 4589 »), avec le symbole et la couleur de sa bulle. */
export interface ContactField {
  label: string;
  value: string;
  icon: string | null;
  color: string | null;
}

export const MAX_FIELDS = 20;

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  phones: Entry[];
  emails: Entry[];
  address: string;
  /** « AAAA-MM-JJ », ou « --MM-JJ » sans l'année. */
  birthday: string | null;
  notes: string;
  tags: string[];
  /** Photo réduite (« data:image/jpeg;base64,… »). */
  photo: string | null;
  color: string | null;
  favorite: boolean;
  spaceId: string | null;
  /** Informations libres, dans l'ordre de la fiche. */
  fields: ContactField[];
  /** Catégorie (« Voisins », « Club de tennis »…). */
  groupId: string | null;
  /** Palette et motifs de la fiche ; nul : ceux par défaut. */
  style: ContactStyle | null;
  createdAt: number;
  updatedAt: number;
  /** « Rester en contact » : tous les combien de jours ; nul : pas de suivi. */
  keepInTouch: number | null;
  /** Dernier échange noté (tiré des échanges, lecture seule). */
  lastContact: DayKey | null;
}

export type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt" | "lastContact">;

export function toInput(c: Contact): ContactInput {
  const { id: _id, createdAt: _c, updatedAt: _u, lastContact: _l, ...input } = c;
  return input;
}

/** Fréquences de « Rester en contact », en jours (les mêmes que le cœur). */
/** `text` : le libellé français, que l'export écrit (traduit en anglais hors du français). */
export const KEEP_IN_TOUCH: readonly { days: number | null; label: string; text: string }[] = [
  { days: null, label: tr("Aucun suivi"), text: fr("Aucun suivi") },
  { days: 7, label: tr("Chaque semaine"), text: fr("Chaque semaine") },
  { days: 14, label: tr("Toutes les 2 semaines"), text: fr("Toutes les 2 semaines") },
  { days: 30, label: tr("Chaque mois"), text: fr("Chaque mois") },
  { days: 90, label: tr("Tous les 3 mois"), text: fr("Tous les 3 mois") },
  { days: 180, label: tr("Tous les 6 mois"), text: fr("Tous les 6 mois") },
  { days: 365, label: tr("Chaque année"), text: fr("Chaque année") },
];

export type InteractionKind = "appel" | "message" | "rencontre" | "email" | "autre";

/** Échange avec un contact. */
export interface Interaction {
  id: string;
  contactId: string;
  day: DayKey;
  kind: InteractionKind;
  note: string;
  createdAt: number;
}

export type InteractionInput = Pick<Interaction, "day" | "kind" | "note">;

export const INTERACTION_KINDS: readonly { id: InteractionKind; label: string; icon: string }[] = [
  { id: "appel", label: tr("Appel"), icon: "telephone" },
  { id: "message", label: tr("Message"), icon: "message" },
  { id: "rencontre", label: tr("Rencontre"), icon: "amis" },
  { id: "email", label: tr("E-mail"), icon: "enveloppe" },
  { id: "autre", label: tr("Autre"), icon: "etoile" },
];

/** Prochain échange prévu : dernier échange plus la fréquence ; nul sans suivi ou sans échange. */
export function nextContact(c: Pick<Contact, "keepInTouch" | "lastContact">): DayKey | null {
  return c.keepInTouch && c.lastContact ? addDays(c.lastContact, c.keepInTouch) : null;
}

/** À recontacter : suivis jamais contactés, puis ceux dont l'échéance est passée, du plus en retard au moins en retard. */
export function toReconnect<T extends Pick<Contact, "keepInTouch" | "lastContact">>(contacts: readonly T[], today: DayKey): T[] {
  const due = (c: T) => nextContact(c) ?? "0000-00-00";
  return contacts.filter((c) => c.keepInTouch !== null && due(c) <= today).sort((a, b) => due(a).localeCompare(due(b)));
}

/** « aujourd'hui », « hier », « il y a 12 jours », « il y a 3 mois », « il y a 2 ans ». */
export function sinceLabel(day: DayKey, today: DayKey): string {
  const n = daysBetween(day, today);
  if (n <= 0) return tr("aujourd'hui");
  if (n === 1) return tr("hier");
  if (n < 60) return tr("il y a {days} jours", { days: n });
  if (n < 730) return tr("il y a {months} mois", { months: Math.round(n / 30) });
  return tr("il y a {years} ans", { years: Math.floor(n / 365) });
}

export const EMPTY_CONTACT: ContactInput = {
  firstName: "",
  lastName: "",
  company: "",
  phones: [],
  emails: [],
  address: "",
  birthday: null,
  notes: "",
  tags: [],
  photo: null,
  color: null,
  favorite: false,
  spaceId: null,
  fields: [],
  groupId: null,
  style: null,
  keepInTouch: null,
};

/** Catégorie de contacts. */
export interface ContactGroup {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  position: number;
}

export type ContactGroupInput = Pick<ContactGroup, "name" | "color" | "icon">;

/** Types proposés, enregistrés en français et traduits à l'affichage (`trValue`). */
export const PHONE_LABELS = [fr("Mobile"), fr("Domicile"), fr("Travail"), fr("Autre")];
export const EMAIL_LABELS = [fr("Personnel"), fr("Travail"), fr("Autre")];

/** « Camille Martin », la société à défaut. */
export function contactName(c: Pick<Contact, "firstName" | "lastName" | "company">): string {
  return [c.firstName, c.lastName].filter((p) => p.trim()).join(" ") || c.company || tr("Sans nom");
}

/** « CM » pour la pastille d'un contact sans photo. */
export function initials(c: Pick<Contact, "firstName" | "lastName" | "company">): string {
  const parts = [c.firstName, c.lastName].filter((p) => p.trim());
  const source = parts.length ? parts : c.company.split(/\s+/).filter(Boolean).slice(0, 2);
  return source.map((p) => p.trim()[0]!.toLocaleUpperCase(locale())).join("").slice(0, 2) || "?";
}

/** Clé de tri : le nom de famille, sinon le prénom, sinon la société. */
export function sortKey(c: Pick<Contact, "firstName" | "lastName" | "company">): string {
  return fold(`${c.lastName || c.firstName || c.company} ${c.firstName}`);
}

export function sortContacts<T extends Pick<Contact, "firstName" | "lastName" | "company">>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b), "fr"));
}

/** Lettre du répertoire (« # » pour un nom qui ne commence pas par une lettre). */
export function letterOf(c: Pick<Contact, "firstName" | "lastName" | "company">): string {
  const first = sortKey(c).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}

/** Le contact correspond-il à la recherche (nom, société, téléphones, e-mails, étiquettes) ? */
export function matches(c: Contact, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const digits = query.replace(/\D/g, "");
  const text = fold([c.firstName, c.lastName, c.company, c.address, ...c.emails.map((e) => e.value), ...c.tags, ...c.fields.map((f) => `${f.label} ${f.value}`)].join(" "));
  return q.split(/\s+/).every((w) => text.includes(w)) || (digits.length >= 3 && c.phones.some((p) => p.value.replace(/\D/g, "").includes(digits)));
}

// ——— Anniversaires ———

/** Mois et jour d'un anniversaire, et l'année si elle est connue. */
export function parseBirthday(text: string | null): { month: number; day: number; year: number | null } | null {
  if (!text) return null;
  const m = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  return { year: m[1] ? Number(m[1]) : null, month: Number(m[2]), day: Number(m[3]) };
}

/** Date de l'anniversaire une année donnée (un 29 février est fêté le 28 les autres années). */
export function birthdayIn(text: string | null, year: number): DayKey | null {
  const b = parseBirthday(text);
  if (!b) return null;
  return makeDay(year, b.month, b.day) ?? makeDay(year, b.month, b.day - 1);
}

/** Prochain anniversaire, aujourd'hui compris. */
export function nextBirthday(text: string | null, today: DayKey): DayKey | null {
  const year = Number(today.slice(0, 4));
  const thisYear = birthdayIn(text, year);
  if (!thisYear) return null;
  return thisYear >= today ? thisYear : birthdayIn(text, year + 1);
}

/** Âge atteint à cet anniversaire, si l'année de naissance est connue. */
export function ageAt(text: string | null, day: DayKey): number | null {
  const b = parseBirthday(text);
  if (!b || b.year === null) return null;
  const age = Number(day.slice(0, 4)) - b.year;
  return age >= 0 ? age : null;
}

export interface BirthdayOccurrence {
  contact: Contact;
  day: DayKey;
  /** Âge fêté, si l'année est connue. */
  age: number | null;
}

/** Anniversaires entre `from` et `to` (compris). */
export function birthdaysBetween(contacts: readonly Contact[], from: DayKey, to: DayKey): BirthdayOccurrence[] {
  const list: BirthdayOccurrence[] = [];
  const first = Number(from.slice(0, 4));
  const last = Number(to.slice(0, 4));
  for (const contact of contacts) {
    for (let year = first; year <= last; year++) {
      const day = birthdayIn(contact.birthday, year);
      if (day && day >= from && day <= to) list.push({ contact, day, age: ageAt(contact.birthday, day) });
    }
  }
  return list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Anniversaires des `days` prochains jours, aujourd'hui compris. */
export function upcomingBirthdays(contacts: readonly Contact[], today: DayKey, days: number): BirthdayOccurrence[] {
  return birthdaysBetween(contacts, today, addDays(today, days - 1));
}

/** « Anniversaire de Camille (35 ans) ». */
export function birthdayTitle(o: Pick<BirthdayOccurrence, "contact" | "age">): string {
  const name = contactName(o.contact);
  return o.age !== null && o.age > 0 ? tr("Anniversaire de {name} ({age} ans)", { name, age: o.age }) : tr("Anniversaire de {name}", { name });
}

/** « 14 mai », « 14 mai 1990 ». */
export function birthdayLabel(text: string | null): string {
  const b = parseBirthday(text);
  if (!b) return "";
  const date = new Date(b.year ?? 2000, b.month - 1, b.day);
  return date.toLocaleDateString(locale(), b.year === null ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}

/** Jours avant le prochain anniversaire (0 : aujourd'hui). */
export function daysUntilBirthday(text: string | null, today: DayKey): number | null {
  const next = nextBirthday(text, today);
  return next ? daysBetween(today, next) : null;
}

/** Genres d'information d'une fiche : chacun sa couleur (fixe) et son symbole. */
export type InfoKind = "phone" | "email" | "address" | "birthday" | "company" | "notes" | "tags";

export const INFO_STYLE: Record<InfoKind, { color: string; symbol: string; label: string }> = {
  phone: { color: "#2fae4a", symbol: "telephone", label: tr("Téléphone") },
  email: { color: "#2d6ff0", symbol: "enveloppe", label: tr("E-mail") },
  address: { color: "#e0671f", symbol: "maison", label: tr("Adresse") },
  birthday: { color: "#e0508a", symbol: "cadeau", label: tr("Anniversaire") },
  company: { color: "#7a5ce6", symbol: "valise", label: "Société" },
  notes: { color: "#e3a712", symbol: "carnet", label: tr("Notes") },
  tags: { color: "#16a3a3", symbol: "drapeau", label: "Étiquettes" },
};
