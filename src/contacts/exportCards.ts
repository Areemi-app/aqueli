/**
 * Export des contacts (cahier des charges § 4.12) : carnet .vcf (vCard 3.0, lu par les téléphones,
 * Gmail et Outlook) ou tableau .csv (colonnes du modèle d'import, lu par Excel). Fonctions pures.
 */
import type { Space } from "../spaces/spaces";
import { contactName, KEEP_IN_TOUCH, type Contact } from "./contacts";
import { trExport } from "../i18n/i18n";

const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Ligne repliée à 75 octets (suite précédée d'une espace), comme le veut la norme. */
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

const phoneType = (label: string) => (/mobile|portable/i.test(label) ? "CELL" : /travail|bureau|pro/i.test(label) ? "WORK" : "HOME");

/** Carnet vCard 3.0 ; l'adresse, écrite librement, va dans la rue. */
export function toVcf(contacts: readonly Contact[]): string {
  const cards = contacts.map((c) => {
    const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${escape(c.lastName)};${escape(c.firstName)};;;`, `FN:${escape(contactName(c))}`];
    if (c.company) lines.push(`ORG:${escape(c.company)}`);
    for (const p of c.phones) lines.push(`TEL;TYPE=${phoneType(p.label)}:${p.value}`);
    for (const e of c.emails) lines.push(`EMAIL;TYPE=INTERNET:${e.value}`);
    if (c.address) lines.push(`ADR;TYPE=HOME:;;${escape(c.address)};;;;`);
    if (c.birthday) lines.push(`BDAY:${c.birthday}`);
    if (c.notes) lines.push(`NOTE:${escape(c.notes)}`);
    if (c.tags.length) lines.push(`CATEGORIES:${c.tags.map(escape).join(",")}`);
    // Identifiant d'Aqueli : la carte réimportée met à jour la fiche au lieu d'en créer une.
    lines.push(`UID:${c.id}@aqueli`);
    lines.push("END:VCARD");
    return lines.map(fold).join("\r\n");
  });
  return `${cards.join("\r\n")}\r\n`;
}

const cell = (text: string) => (/[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** « 14/05/2016 », « 21/03 » : comme dans le modèle d'import. */
const birthdayCell = (b: string | null) => {
  if (!b) return "";
  const m = /^(\d{4}|-)-?(\d{2})-(\d{2})$/.exec(b);
  if (!m) return b;
  return m[1] === "-" ? `${m[3]}/${m[2]}` : `${m[3]}/${m[2]}/${m[1]}`;
};

/** Colonnes du modèle d'import « Contacts », puis l'identifiant (mise à jour à la réimportation). */
export const CSV_COLUMNS = ["Prénom", "Nom", "Société", "Téléphone", "E-mail", "Adresse", "Anniversaire", "Étiquettes", "Rester en contact", "Espace", "Notes", "Identifiant"] as const;

/** Tableau CSV (séparateur « ; », encodé en UTF-8 avec BOM pour Excel), colonnes du modèle d'import. */
export function toCsv(contacts: readonly Contact[], spaces: readonly Pick<Space, "id" | "name">[]): string {
  const rows = contacts.map((c) =>
    [
      c.firstName,
      c.lastName,
      c.company,
      c.phones.map((p) => p.value).join("; "),
      c.emails.map((e) => e.value).join("; "),
      c.address,
      birthdayCell(c.birthday),
      c.tags.join(", "),
      c.keepInTouch ? trExport(KEEP_IN_TOUCH.find((k) => k.days === c.keepInTouch)?.text ?? "").toLowerCase() : "",
      spaces.find((s) => s.id === c.spaceId)?.name ?? "",
      c.notes,
      c.id,
    ]
      .map(cell)
      .join(";"),
  );
  // Colonnes en fran\u00e7ais, ou en anglais dans toute autre langue : l'import ne lit que ces deux langues.
  return `\ufeff${[CSV_COLUMNS.map((c) => trExport(c)).join(";"), ...rows].join("\r\n")}\r\n`;
}
