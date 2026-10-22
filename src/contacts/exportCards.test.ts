import { describe, expect, it } from "vitest";
import { COLUMNS, ID_COLUMN } from "../import/fields";
import { readImportFile, previewSources } from "../import/sources";
import type { ImportContext } from "../import/records";
import { EMPTY_CONTACT, type Contact } from "./contacts";
import { CSV_COLUMNS, toCsv, toVcf } from "./exportCards";

const contact = (c: Partial<Contact>): Contact => ({ ...EMPTY_CONTACT, id: "c", createdAt: 0, updatedAt: 0, lastContact: null, ...c });

const LEA = contact({
  firstName: "Léa",
  lastName: "Bernard",
  company: "Agence; Horizon",
  phones: [
    { label: "Mobile", value: "06 12 34 56 78" },
    { label: "Domicile", value: "01 44 55 66 77" },
  ],
  emails: [{ label: "Personnel", value: "lea@exemple.fr" }],
  address: "12 rue des Lilas\n75011 Paris",
  birthday: "2016-05-14",
  notes: "Préfère les SMS, le soir. ".repeat(6).trim(),
  tags: ["famille", "club/tennis"],
  spaceId: "famille",
  keepInTouch: 30,
});
const GARAGE = contact({ company: "Garage Dupont", phones: [{ label: "Travail", value: "04 78 00 00 00" }], birthday: "--03-21" });

const ctx: ImportContext = {
  now: new Date(2026, 9, 2),
  today: "2026-10-02",
  date1904: false,
  spaces: [{ id: "famille", name: "Famille" }] as unknown as ImportContext["spaces"],
  defaultSpaceId: null,
  notebooks: [],
  categories: [],
  defaultReminder: null,
  existing: { tasks: [], events: [], obligations: [], notes: [] },
};

async function reimport(name: string, text: string) {
  const file = await readImportFile(name, new TextEncoder().encode(text));
  return previewSources(file.sources, {}, ctx).flatMap((s) => s.rows);
}

describe("export des contacts", () => {
  it("écrit un carnet vCard replié à 75 octets, relu tel quel par l'import", async () => {
    const vcf = toVcf([LEA, GARAGE]);
    expect(vcf.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\nN:Bernard;Léa;;;\r\n")).toBe(true);
    expect(vcf.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    const rows = await reimport("contacts.vcf", vcf);
    // Relu dans un compte vide : seul l'identifiant, inconnu ici, est signalé (un nouvel élément sera créé).
    expect(rows.filter((r) => r.errors.length || r.warnings.some((w) => !w.startsWith("Identifiant inconnu")))).toEqual([]);
    expect(rows[0]!.item).toMatchObject({
      kind: "contact",
      input: {
        firstName: "Léa",
        lastName: "Bernard",
        company: "Agence; Horizon",
        phones: [{ value: "06 12 34 56 78" }, { value: "01 44 55 66 77" }],
        emails: [{ value: "lea@exemple.fr" }],
        birthday: "2016-05-14",
        notes: LEA.notes,
        tags: ["famille", "club/tennis"],
      },
    });
    expect(rows[1]!.item).toMatchObject({ input: { company: "Garage Dupont", birthday: "--03-21" } });
  });

  it("écrit un tableau CSV aux colonnes du modèle d'import, relu tel quel", async () => {
    expect([...CSV_COLUMNS]).toEqual([...COLUMNS.contact, ID_COLUMN].map((c) => c.names[0]));
    const csv = toCsv([LEA, GARAGE], ctx.spaces);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = await reimport("contacts.csv", csv);
    // Relu dans un compte vide : seul l'identifiant, inconnu ici, est signalé (un nouvel élément sera créé).
    expect(rows.filter((r) => r.errors.length || r.warnings.some((w) => !w.startsWith("Identifiant inconnu")))).toEqual([]);
    expect(rows[0]!.item).toMatchObject({
      input: { firstName: "Léa", company: "Agence; Horizon", address: "12 rue des Lilas\n75011 Paris", birthday: "2016-05-14", spaceId: "famille", tags: ["famille", "club/tennis"], keepInTouch: 30 },
    });
    expect(rows[1]!.item).toMatchObject({ input: { company: "Garage Dupont", birthday: "--03-21", keepInTouch: null } });
  });

  it("écrit le tableau CSV en anglais dans une autre langue, relu tel quel", async () => {
    const { setLanguageForTests, tr } = await import("../i18n/i18n");
    const { EN } = await import("../i18n/en");
    const { default: ja } = await import("../i18n/locales/ja.json");
    setLanguageForTests("ja", EN, ja);
    try {
      const csv = toCsv([LEA, GARAGE], ctx.spaces);
      expect(csv.split("\r\n")[0]).toContain("Keep in touch");
      expect(csv).toContain(";every month;");
      const rows = await reimport("contacts.csv", csv);
      const unknownId = tr("Identifiant inconnu : un nouvel élément sera créé.");
      expect(rows.filter((r) => r.errors.length || r.warnings.some((w) => w !== unknownId))).toEqual([]);
      expect(rows[0]!.item).toMatchObject({ input: { firstName: "Léa", keepInTouch: 30 } });
    } finally {
      setLanguageForTests("fr", null);
    }
  });
});
