import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EN } from "../i18n/en";
import { LANGUAGES } from "../i18n/i18n";
import { CATEGORIES } from "../obligations/obligations";
import type { Space } from "../spaces/spaces";
import { decodeText, detectDelimiter, parseCsv } from "./csv";
import type { BudgetCategory } from "../budget/budget";
import type { List } from "../lists/lists";
import { repeatFromRule } from "./cards";
import { COLUMNS, fieldOf, KINDS, kindFromHeaders, kindFromWord, type ImportKind } from "./fields";
import { lineRecords } from "./lines";
import { markdownToDoc } from "./markdown";
import { buildRows, tableRecords, toBatch, type ExistingItems, type ImportContext, type ImportRow } from "./records";
import { previewSources, readImportFile, type SourceChoice } from "./sources";
import {
  isBad,
  parseDateTime,
  parseDay,
  parseDuration,
  parseBirthday,
  parseHabitFrequency,
  parseMoney,
  parsePeriod,
  parsePriority,
  parseReminder,
  parseRepeat,
  parseTags,
  parseTime,
} from "./values";
import { ImportFileError, readWorkbook } from "./xlsx";

const today = "2026-09-29";
const opts = { today };

const SPACES: Space[] = [
  { id: "perso", name: "Perso", color: "#2d6ff0", icon: "maison", position: 0 },
  { id: "travail", name: "Travail", color: "#e89a1c", icon: "valise", position: 1 },
  { id: "sante", name: "Santé", color: "#e0508a", icon: "coeur", position: 2 },
  { id: "famille", name: "Famille", color: "#2fae4a", icon: "maison", position: 3 },
] as unknown as Space[];

const NONE: ExistingItems = { tasks: [], events: [], obligations: [], notes: [] };

/** Catégories du budget par défaut (src-tauri/src/data/budget.rs). */
const BUDGET = (
  [
    ["cat-courses", "Courses", "depense"],
    ["cat-logement", "Logement", "depense"],
    ["cat-transports", "Transports", "depense"],
    ["cat-loisirs", "Loisirs", "depense"],
    ["cat-salaire", "Salaire", "revenu"],
    ["cat-autres-revenus", "Autres revenus", "revenu"],
  ] as const
).map(([id, name, kind], position) => ({ id, name, kind, color: null, icon: "etoile", monthlyCents: null, position, createdAt: 0 })) as unknown as BudgetCategory[];

function context(existing: ExistingItems = NONE): ImportContext {
  return {
    now: new Date(2026, 8, 29, 10, 0),
    today,
    date1904: false,
    spaces: SPACES,
    defaultSpaceId: "perso",
    notebooks: [{ id: "c1", name: "Maison", parentId: null, color: null, icon: null, folderId: null, createdAt: 0 }],
    categories: CATEGORIES,
    defaultReminder: 15,
    budgetCategories: BUDGET,
    lists: [],
    existing,
  };
}

const bytes = (text: string) => new TextEncoder().encode(text);

async function preview(name: string, content: Uint8Array, existing?: ExistingItems, choices: Record<string, SourceChoice> = {}) {
  const file = await readImportFile(name, content);
  return previewSources(file.sources, choices, { ...context(existing), date1904: file.date1904 });
}

const rowsOf = (list: { rows: ImportRow[] }[]) => list.flatMap((s) => s.rows);

describe("valeurs", () => {
  it("lit l'anniversaire d'un contact, avec ou sans l'année", () => {
    expect(parseBirthday("14/05/1990")).toBe("1990-05-14");
    expect(parseBirthday("1990-05-14")).toBe("1990-05-14");
    expect(parseBirthday("14 mai 1990")).toBe("1990-05-14");
    expect(parseBirthday("1er mars")).toBe("--03-01");
    expect(parseBirthday("29/02")).toBe("--02-29");
    expect(parseBirthday("21/03")).toBe("--03-21");
    expect(parseBirthday("32/01")).toMatchObject({ message: "Anniversaire illisible : « 32/01 »." });
    expect(isBad(parseBirthday("14/05/2999"))).toBe(true);
  });

  it("lit la fréquence d'une habitude", () => {
    expect(parseHabitFrequency("Chaque jour")).toEqual({ kind: "quotidien" });
    expect(parseHabitFrequency("")).toEqual({ kind: "quotidien" });
    expect(parseHabitFrequency("Tous les jours")).toEqual({ kind: "quotidien" });
    expect(parseHabitFrequency("3 fois par semaine")).toEqual({ kind: "semaine", times: 3 });
    expect(parseHabitFrequency("2x/semaine")).toEqual({ kind: "semaine", times: 2 });
    expect(parseHabitFrequency("lun, mer, ven")).toEqual({ kind: "jours", days: [1, 3, 5] });
    expect(parseHabitFrequency("Mardi et jeudi")).toEqual({ kind: "jours", days: [2, 4] });
    expect(parseHabitFrequency("les samedis")).toEqual({ kind: "jours", days: [6] });
    expect(parseHabitFrequency("En semaine")).toEqual({ kind: "jours", days: [1, 2, 3, 4, 5] });
    expect(parseHabitFrequency("le week-end")).toEqual({ kind: "jours", days: [6, 0] });
    expect(isBad(parseHabitFrequency("9 fois par semaine"))).toBe(true);
    expect(parseHabitFrequency("souvent")).toMatchObject({ message: "Fréquence illisible : « souvent »." });
  });

  it("lit les dates françaises, ISO, en mots et d'Excel", () => {
    expect(parseDay("03/10/2026", opts)).toBe("2026-10-03");
    expect(parseDay("3-10-26", opts)).toBe("2026-10-03");
    expect(parseDay("3.10.2026", opts)).toBe("2026-10-03");
    expect(parseDay("2026-10-03", opts)).toBe("2026-10-03");
    expect(parseDay("3 octobre 2026", opts)).toBe("2026-10-03");
    expect(parseDay("1er novembre", opts)).toBe("2026-11-01");
    expect(parseDay("demain", opts)).toBe("2026-09-30");
    expect(parseDay("46298", opts)).toBe("2026-10-03");
    expect(parseDay("44836", { today, date1904: true })).toBe("2026-10-03");
    expect(isBad(parseDay("31/02/2026", opts))).toBe(true);
    expect(isBad(parseDay("bientôt", opts))).toBe(true);
  });

  it("lit les heures, les créneaux et les dates avec heure", () => {
    expect(parseTime("14:00")).toBe("14:00");
    expect(parseTime("9h")).toBe("09:00");
    expect(parseTime("9 h 15")).toBe("09:15");
    expect(parseTime("14:30:00")).toBe("14:30");
    expect(parseTime("midi")).toBe("12:00");
    expect(parseTime("0.5")).toBe("12:00");
    expect(isBad(parseTime("25:00"))).toBe(true);
    expect(parseDateTime("08/10/2026 09:30-10:00", opts)).toEqual({ day: "2026-10-08", start: "09:30", end: "10:00" });
    expect(parseDateTime("03/10/2026 à 14h", opts)).toEqual({ day: "2026-10-03", start: "14:00", end: null });
    expect(parseDateTime("2026-10-03T14:00", opts)).toEqual({ day: "2026-10-03", start: "14:00", end: null });
    expect(parseDateTime("46298.75", opts)).toEqual({ day: "2026-10-03", start: "18:00", end: null });
    expect(parseDateTime("03/10/2026", opts)).toEqual({ day: "2026-10-03", start: null, end: null });
  });

  it("lit les durées, rappels, priorités, étiquettes, montants et périodicités", () => {
    expect(parseDuration("1 h 30")).toBe(90);
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("1,5 h")).toBe(90);
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("2 jours")).toBe(2880);
    expect(parseReminder("15 min avant")).toBe(15);
    expect(parseReminder("à l'heure")).toBe(0);
    expect(parseReminder("aucun")).toBeNull();
    expect(isBad(parseReminder("2 semaines"))).toBe(true);
    expect(parsePriority("Haute")).toBe(3);
    expect(parsePriority("!moyenne")).toBe(2);
    expect(parsePriority("basse")).toBe(1);
    expect(isBad(parsePriority("capitale"))).toBe(true);
    expect(parseTags("#voiture, garage;Garage")).toEqual(["voiture", "garage"]);
    expect(isBad(parseTags("mot*clé"))).toBe(true);
    expect(parseMoney("312 €")).toBe(31200);
    expect(parseMoney("1 234,50 EUR")).toBe(123450);
    expect(parseMoney("45.899999999")).toBe(4590);
    expect(isBad(parseMoney("-5"))).toBe(true);
    expect(parsePeriod("Annuelle")).toBe(12);
    expect(parsePeriod("tous les 3 mois")).toBe(3);
    expect(parsePeriod("ponctuelle")).toBeNull();
    expect(isBad(parsePeriod("tous les 5 mois"))).toBe(true);
  });

  it("lit les répétitions, calées sur l'échéance", () => {
    expect(parseRepeat("chaque lundi", "2026-10-05", true)).toEqual({ kind: "weekly", interval: 1, days: [1] });
    expect(parseRepeat("chaque mois", "2026-10-15", true)).toEqual({ kind: "monthly", interval: 1, day: 15 });
    expect(parseRepeat("mensuelle", "2026-10-15", true)).toEqual({ kind: "monthly", interval: 1, day: 15 });
    expect(parseRepeat("aucune", "2026-10-15", true)).toBeNull();
    expect(isBad(parseRepeat("3 jours après l'achèvement", today, false))).toBe(true);
    expect(isBad(parseRepeat("parfois", today, true))).toBe(true);
  });
});

describe("CSV et texte", () => {
  it("devine le séparateur et lit les guillemets et les retours à la ligne", () => {
    expect(detectDelimiter("Titre;Date\nA;B")).toBe(";");
    expect(detectDelimiter("Titre,Date\nA,B")).toBe(",");
    expect(detectDelimiter("Titre\tDate")).toBe("\t");
    const rows = parseCsv('Titre;Notes\n"Appeler; vite";"Deux\nlignes"\n\n"Dit ""bonjour""";x\n');
    expect(rows).toEqual([
      { line: 1, cells: ["Titre", "Notes"] },
      { line: 2, cells: ["Appeler; vite", "Deux\nlignes"] },
      { line: 5, cells: ['Dit "bonjour"', "x"] },
    ]);
    expect(parseCsv("sep=,\nA,B")).toEqual([{ line: 2, cells: ["A", "B"] }]);
  });

  it("décode l'UTF-8 (avec ou sans BOM) et l'encodage Windows d'Excel", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0xc3, 0xa9]))).toBe("é");
    expect(decodeText(new Uint8Array([0x54, 0xe2, 0x63, 0x68, 0x65]))).toBe("Tâche");
    expect(() => decodeText(new Uint8Array([0x50, 0, 0x4b]))).toThrow(ImportFileError);
  });
});

// ——— Classeur Excel fabriqué pour les tests ———

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(data);
      c.close();
    },
  }).pipeThrough(new CompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(r.value);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function zip(files: Record<string, string>, compress = true): Promise<Uint8Array> {
  const parts: number[] = [];
  const central: number[] = [];
  const le = (n: number, size: number) => Array.from({ length: size }, (_, i) => (n >>> (8 * i)) & 0xff);
  let count = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = bytes(text);
    const data = compress ? await deflate(raw) : raw;
    const nameBytes = [...bytes(name)];
    const offset = parts.length;
    const common = [...le(20, 2), ...le(0x0800, 2), ...le(compress ? 8 : 0, 2), ...le(0, 4), ...le(crc32(raw), 4), ...le(data.length, 4), ...le(raw.length, 4), ...le(nameBytes.length, 2), ...le(0, 2)];
    parts.push(...le(0x04034b50, 4), ...common, ...nameBytes, ...data);
    central.push(...le(0x02014b50, 4), ...le(20, 2), ...common, ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(offset, 4), ...nameBytes);
    count++;
  }
  const end = [...le(0x06054b50, 4), ...le(0, 4), ...le(count, 2), ...le(count, 2), ...le(central.length, 4), ...le(parts.length, 4), ...le(0, 2)];
  return new Uint8Array([...parts, ...central, ...end]);
}

const MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function workbook(sheets: { name: string; xml: string; hidden?: boolean }[], shared: string[] = [], date1904 = false): Record<string, string> {
  const files: Record<string, string> = {
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook ${MAIN} xmlns:r="${REL}">${date1904 ? '<workbookPr date1904="1"/>' : ""}<sheets>${sheets
      .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"${s.hidden ? ' state="hidden"' : ""}/>`)
      .join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}<Relationship Id="rIdS" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst ${MAIN}>${shared.map((s) => s.startsWith("<") ? `<si>${s}</si>` : `<si><t>${s}</t></si>`).join("")}</sst>`,
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = `<worksheet ${MAIN}><sheetData>${s.xml}</sheetData></worksheet>`));
  return files;
}

describe("classeur Excel", () => {
  it("lit les chaînes partagées, les formules (valeur enregistrée), les booléens et saute les lignes vides", async () => {
    const shared = ["Titre", "Échéance", "Priorité", "<r><rPr><b/></rPr><t>Appeler </t></r><r><t>le garage</t></r><rPh><t>x</t></rPh>", "Épinglée"];
    const xml = [
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>4</v></c></row>',
      '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>46298</v></c><c r="C2" t="str"><f>"haute"</f><v>haute</v></c><c r="D2" t="b"><v>1</v></c></row>',
      '<row r="3"/>',
      '<row r="5"><c r="C5" t="inlineStr"><is><t>basse</t></is></c><c r="A5" t="e"><v>#N/A</v></c></row>',
    ].join("");
    const book = await readWorkbook(await zip(workbook([{ name: "Tâches", xml }, { name: "Cachée", xml, hidden: true }], shared)));
    expect(book.sheets).toHaveLength(1);
    expect(book.sheets[0]!.name).toBe("Tâches");
    expect(book.sheets[0]!.rows).toEqual([
      { line: 1, cells: ["Titre", "Échéance", "Priorité", "Épinglée"] },
      { line: 2, cells: ["Appeler le garage", "46298", "haute", "oui"] },
      { line: 5, cells: ["", "", "basse"] },
    ]);
  });

  it("lit aussi une archive sans compression et les dates comptées depuis 1904", async () => {
    const xml = '<row r="1"><c t="inlineStr"><is><t>Titre</t></is></c><c t="inlineStr"><is><t>Échéance</t></is></c></row><row r="2"><c t="inlineStr"><is><t>Rendez-vous</t></is></c><c><v>44836</v></c></row>';
    const file = await readImportFile("liste.xlsx", await zip(workbook([{ name: "Tâches", xml }], [], true), false));
    expect(file.date1904).toBe(true);
    const rows = rowsOf(previewSources(file.sources, {}, { ...context(), date1904: true }));
    expect(rows[0]!.item).toMatchObject({ kind: "task", input: { title: "Rendez-vous", dueDate: "2026-10-03" } });
  });

  it("refuse les classeurs protégés, les anciens .xls et les déclarations d'entités", async () => {
    await expect(readWorkbook(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).rejects.toThrow(/mot de passe/);
    const evil = workbook([{ name: "Tâches", xml: "" }]);
    evil["xl/workbook.xml"] = `<!DOCTYPE x [<!ENTITY a "aaaa">]>${evil["xl/workbook.xml"]}`;
    await expect(readWorkbook(await zip(evil))).rejects.toThrow(ImportFileError);
    await expect(readWorkbook(bytes("PK pas une archive"))).rejects.toThrow(ImportFileError);
  });

  it("reconnaît les onglets Dépenses et Listes, et ignore les onglets vides", async () => {
    const header = '<row r="1"><c t="inlineStr"><is><t>Titre</t></is></c></row>';
    const line = '<row r="2"><c t="inlineStr"><is><t>Courses</t></is></c></row>';
    const file = await readImportFile(
      "classeur.xlsx",
      await zip(workbook([{ name: "Dépenses", xml: header + line }, { name: "Notes", xml: header }, { name: "Mes listes", xml: header + line }])),
    );
    expect(file.sources.map((s) => (s.type === "table" ? s.kind : s.type))).toEqual(["transaction", "listItem"]);
    expect(file.sources[0]).toMatchObject({ label: "Onglet « Dépenses »" });
  });
});

describe("types et colonnes", () => {
  it("reconnaît le type d'après le nom ou les colonnes", () => {
    expect(kindFromWord("Mes tâches")).toEqual({ kind: "task" });
    expect(kindFromWord("Rendez-vous")).toEqual({ kind: "event" });
    expect(kindFromWord("Dépenses")).toEqual({ kind: "transaction" });
    expect(kindFromWord("releve-compte.csv", false)).toEqual({ kind: "transaction" });
    expect(kindFromWord("Listes")).toEqual({ kind: "listItem" });
    expect(kindFromWord("liste", false)).toBeNull();
    expect(kindFromHeaders(["Date", "Libellé", "Débit", "Crédit"])).toBe("transaction");
    expect(kindFromHeaders(["Date", "Libellé", "Montant"])).toBe("transaction");
    expect(kindFromHeaders(["Titre", "Catégorie", "Échéance", "Montant"])).toBe("obligation");
    expect(kindFromHeaders(["Liste", "Élément", "Rayon"])).toBe("listItem");
    expect(kindFromHeaders(["Titre", "Date", "Début", "Fin", "Lieu"])).toBe("event");
    expect(kindFromHeaders(["Titre", "Échéance", "Montant"])).toBe("obligation");
    expect(kindFromHeaders(["Titre", "Texte"])).toBe("note");
    expect(kindFromHeaders(["Titre", "Échéance"])).toBe("task");
    expect(fieldOf("task", "  ÉCHÉANCE ")).toBe("due");
    expect(fieldOf("task", "Sous taches")).toBe("subtasks");
  });

  it("les modèles du guide d'import n'ont que des colonnes reconnues", () => {
    const templates: [ImportKind, string][] = [
      ["task", "Modèle tâches.csv"],
      ["event", "Modèle événements.csv"],
      ["obligation", "Modèle obligations.csv"],
      ["note", "Modèle notes.csv"],
      ["habit", "Modèle habitudes.csv"],
      ["contact", "Modèle contacts.csv"],
      ["transaction", "Modèle dépenses.csv"],
      ["listItem", "Modèle listes.csv"],
    ];
    for (const [kind, name] of templates) {
      const headers = parseCsv(decodeText(readFileSync(`src-tauri/guide/${name}`)))[0]!.cells;
      expect(headers.map((h) => fieldOf(kind, h))).not.toContain(null);
      // Chaque colonne des modèles est la première de sa liste de synonymes.
      expect(headers).toEqual(COLUMNS[kind].map((c) => c.names[0]));
      // « liste » n'est pas reconnu dans un nom de fichier : le CSV des listes l'est à ses colonnes.
      if (kind === "listItem") expect(kindFromHeaders(headers)).toBe(kind);
      else expect(kindFromWord(name, false)).toEqual({ kind });
    }
  });

  it("le guide décrit chaque colonne des modèles", () => {
    const guide = readFileSync("src-tauri/guide/LISEZ-MOI.html", "utf8");
    for (const kind of KINDS) {
      for (const column of COLUMNS[kind]) expect(guide).toContain(`<td class="col">${column.names[0]}`);
    }
  });

  it("les lignes du classeur d'exemple s'importent sans erreur ni avertissement", async () => {
    const tabs: [ImportKind, string][] = [
      ["task", "Tâches"],
      ["event", "Événements"],
      ["obligation", "Obligations"],
      ["note", "Notes"],
      ["habit", "Habitudes"],
      ["contact", "Contacts"],
      ["transaction", "Dépenses"],
      ["listItem", "Listes"],
    ];
    for (const [kind, name] of tabs) {
      const text = readFileSync(`src-tauri/guide/exemples/${name}.tsv`, "utf8");
      const [header, ...rows] = parseCsv(text);
      expect(header!.cells).toEqual(COLUMNS[kind].map((c) => c.names[0]));
      const records = tableRecords(header!.cells, rows, kind);
      const built = buildRows(name, records, context(), new Set(), new Map());
      expect(built.filter((r) => r.errors.length || r.warnings.length || !r.checked)).toEqual([]);
      expect(built.every((r) => r.item?.kind === kind)).toBe(true);
    }
  });
});

describe("fichier texte", () => {
  it("lit l'exemple du guide sans erreur", async () => {
    const list = await preview("Exemple.txt", readFileSync("src-tauri/guide/Exemple.txt"));
    const rows = rowsOf(list);
    expect(rows).toHaveLength(13);
    expect(rows.filter((r) => r.errors.length || r.warnings.length)).toEqual([]);
    expect(rows.every((r) => r.checked)).toBe(true);
    const [garage, cartons, plantes, dentiste, mer, assurance, telephone, idees, lire, lea, courses, salaire, lait] = rows.map((r) => r.item);
    expect(courses).toMatchObject({ kind: "transaction", input: { day: "2026-09-27", amountCents: 4250, kind: "depense", categoryId: "cat-courses", label: "Courses" } });
    expect(salaire).toMatchObject({ kind: "transaction", input: { day: "2026-10-01", amountCents: 245000, kind: "revenu", categoryId: "cat-salaire", label: "Salaire de septembre" } });
    expect(lait).toMatchObject({ kind: "listItem", list: { name: "Courses", id: null, input: { template: "courses" } }, input: { title: "Lait", section: "Frais" } });
    expect(garage).toMatchObject({
      kind: "task",
      input: { title: "Appeler le garage", dueDate: "2026-10-03", dueTime: "14:00", tags: ["voiture"], priority: 3, spaceId: "perso", reminder: 15, inbox: false },
    });
    expect(cartons).toMatchObject({ kind: "task", input: { estimate: 120, subtasks: [{ title: "Cuisine" }, { title: "Salon" }, { title: "Chambre" }] } });
    expect(plantes).toMatchObject({ kind: "task", input: { dueDate: null, recurrence: { kind: "weekly", interval: 1 }, inbox: false } });
    expect(dentiste).toMatchObject({
      kind: "event",
      input: { startDate: "2026-10-08", startTime: "09:30", endTime: "10:00", location: "Cabinet Martin", reminder: 60, spaceId: "sante" },
    });
    expect(mer).toMatchObject({ kind: "event", input: { startDate: "2026-10-17", endDate: "2026-10-18", startTime: null, reminder: null } });
    expect(assurance).toMatchObject({
      kind: "obligation",
      input: { category: "assurances", dueDate: "2026-11-15", cancelBy: "2026-10-15", amountCents: 31200, periodMonths: 12, status: "a-faire" },
    });
    expect(telephone).toMatchObject({ kind: "obligation", input: { category: "abonnements", amountCents: 1999, periodMonths: 1, organization: "Opérateur" } });
    expect(idees).toMatchObject({ kind: "note", body: { title: "Idées cadeaux", plain: "Livre de cuisine, écharpe, jeu de société" } });
    expect(lea).toMatchObject({ kind: "contact", input: { firstName: "Léa", lastName: "Bernard", birthday: "2016-05-14" } });
    expect(lire).toMatchObject({
      kind: "habit",
      input: { name: "Lire", kind: "quantite", target: 20, unit: "pages", frequency: { kind: "jours", days: [1, 3, 5] }, reminder: "21:30" },
    });

    const { batch, origin } = toBatch(rows);
    expect([batch.tasks.length, batch.events.length, batch.obligations.length, batch.notes.length, batch.habits.length, batch.contacts.length]).toEqual([3, 2, 2, 1, 1, 1]);
    expect([batch.transactions.length, batch.lists.length, batch.lists[0]!.items.length]).toEqual([2, 1, 1]);
    expect(origin.event[1]!.line).toBe(5);
  });

  it("lit une liste sans type comme des tâches en saisie rapide, puces et cases comprises", async () => {
    const text = "# Déménagement\n- [ ] Réserver le camion demain 9h #déménagement !haute\n- [x] Trier les livres\n2. Résilier la box @Travail\n\n// commentaire\n";
    const rows = rowsOf(await preview("liste.txt", bytes(text)));
    expect(rows.map((r) => r.title)).toEqual(["Réserver le camion", "Trier les livres", "Résilier la box"]);
    expect(rows[0]!.item).toMatchObject({ input: { dueDate: "2026-09-30", dueTime: "09:00", priority: 3, tags: ["déménagement"] } });
    expect(rows[1]).toMatchObject({ checked: false, warnings: ["Case cochée : élément déjà fait."] });
    expect(rows[2]!.item).toMatchObject({ input: { spaceId: "travail", inbox: true } });
  });

  it("lit un fichier .md sans type comme une seule note, ou ligne par ligne sur demande", async () => {
    const text = "# Recette\n\nFaire **fondre** le beurre.\n\n- farine\n- sucre\n";
    const [note] = rowsOf(await preview("recette.md", bytes(text)));
    expect(note!.item).toMatchObject({ kind: "note", body: { title: "Recette" } });
    const lines = rowsOf(await preview("recette.md", bytes(text), NONE, { texte: "tasks" }));
    expect(lines.map((r) => r.title)).toEqual(["Faire **fondre** le beurre.", "farine", "sucre"]);
  });

  it("lit les dépenses, les types inconnus, et les champs refusés", () => {
    const records = lineRecords(
      [
        { line: 1, text: "DÉPENSE | 42,50 € | Courses" },
        { line: 2, text: "TÂCHE | Rappel | 31/02/2026" },
        { line: 3, text: "rdv | Coiffeur | lieu: Salon | 12/10/2026 18h" },
      ],
      "tasks",
      today,
    );
    expect(records[0]).toMatchObject({ kind: "transaction", fields: { title: "42,50 €" }, extra: ["Courses"] });
    expect(records[1]).toMatchObject({ kind: "task", extra: ["31/02/2026"] });
    expect(records[2]).toMatchObject({ kind: "event", fields: { title: "Coiffeur", location: "Salon", date: "12/10/2026 18h" } });
  });
});

describe("aperçu", () => {
  it("vérifie des contacts : nom, numéros, e-mails, anniversaire et doublon", async () => {
    const csv = [
      "Prénom;Nom;Société;Téléphone;E-mail;Anniversaire;Étiquettes;Espace",
      'Léa;Bernard;;"06 12 34 56 78; 01 44 55 66 77";lea@exemple.fr;14/05/2016;famille;Famille',
      ";;Garage Dupont;01 98 76 54 32;;;artisan;",
      "Paul;;;appeler;;;;",
      ";;;;paul@exemple;;;",
      "Camille;Martin;;;;21/03;;",
    ].join("\n");
    const existing = { ...NONE, contacts: [{ firstName: "camille", lastName: "MARTIN", company: "" }] };
    const [source] = await preview("contacts.csv", bytes(csv), existing);
    const rows = source!.rows;
    expect(rows.every((r) => r.kind === "contact")).toBe(true);
    expect(rows[0]!.item).toMatchObject({
      kind: "contact",
      input: {
        firstName: "Léa",
        lastName: "Bernard",
        phones: [
          { label: "Mobile", value: "06 12 34 56 78" },
          { label: "Domicile", value: "01 44 55 66 77" },
        ],
        emails: [{ label: "Personnel", value: "lea@exemple.fr" }],
        birthday: "2016-05-14",
        tags: ["famille"],
        spaceId: "famille",
      },
    });
    expect(rows[1]).toMatchObject({ title: "Garage Dupont", checked: true });
    expect(rows[2]!.errors).toEqual(["Téléphone illisible : « appeler »."]);
    expect(rows[3]!.errors).toEqual(["Nom manquant.", "Adresse e-mail illisible : « paul@exemple »."]);
    expect(rows[4]).toMatchObject({ duplicate: "Déjà dans Aqueli.", checked: false });
  });

  it("lit une ligne de texte de contact : nom complet, numéro, e-mail et date reconnus", async () => {
    const [source] = await preview("liste.txt", bytes("CONTACT | Paul Durand | 07 98 76 54 32 | paul@exemple.fr | 02/11/1958 | voisin de palier"));
    expect(source!.rows[0]!.item).toMatchObject({
      kind: "contact",
      input: { firstName: "Paul", lastName: "Durand", phones: [{ value: "07 98 76 54 32" }], emails: [{ value: "paul@exemple.fr" }], birthday: "1958-11-02", notes: "voisin de palier" },
    });
  });

  it("vérifie des habitudes : quantité, jours, rappel, doublon d'une habitude existante", async () => {
    const csv = [
      "Nom;Fréquence;Objectif;Unité;Rappel;À arrêter;Espace",
      "Lire;lun, mer, ven;20;pages;21:30;;Perso",
      "Ne pas fumer;;;;;oui;Santé",
      "Courir;souvent;;;;;",
      "Boire de l'eau;;0;;;;",
      "Méditer;Chaque jour;;;;;",
    ].join("\n");
    const existing = { ...NONE, habits: [{ name: "méditer" }] };
    const [source] = await preview("habitudes.csv", bytes(csv), existing);
    const rows = source!.rows;
    expect(rows.map((r) => r.kind)).toEqual(["habit", "habit", "habit", "habit", "habit"]);
    expect(rows[0]!.item).toEqual({
      kind: "habit",
      input: {
        name: "Lire",
        icon: "livre",
        color: "#7a5ce6",
        kind: "quantite",
        negative: false,
        target: 20,
        unit: "pages",
        frequency: { kind: "jours", days: [1, 3, 5] },
        reminder: "21:30",
        moment: null,
        spaceId: "perso",
      },
    });
    expect(rows[0]!.details).toEqual(["Perso", "Lun, Mer, Ven", "20 pages", "Rappel 21:30"]);
    expect(rows[1]!.item).toMatchObject({ kind: "habit", input: { kind: "oui-non", negative: true, spaceId: "sante", frequency: { kind: "quotidien" } } });
    expect(rows[2]!.errors).toEqual(["Fréquence illisible : « souvent »."]);
    expect(rows[3]!.errors).toEqual(["Objectif refusé : 0 (nombre entier de 1 à 1000)."]);
    expect(rows[4]).toMatchObject({ duplicate: "Déjà dans Aqueli.", checked: false });
    expect(toBatch(rows.filter((r) => r.checked)).batch.habits).toHaveLength(2);
  });

  it("reconnaît un onglet ou une colonne « Type » d'habitudes", () => {
    expect(kindFromWord("Habitudes")).toEqual({ kind: "habit" });
    expect(kindFromHeaders(["Nom", "Objectif", "Unité"])).toBe("habit");
  });

  it("vérifie un CSV : erreurs expliquées, avertissements, doublons dans le fichier et dans Aqueli", async () => {
    const csv = [
      "Titre;Échéance;Heure;Espace;Priorité;Couleur",
      "Appeler le garage;03/10/2026;14:00;Perso;haute;rouge",
      ";04/10/2026;;;;",
      "Payer la cantine;32/10/2026;;;;",
      "Appeler le garage;03/10/2026;;;;",
      "Arroser;;;Maison;;",
      "Heure seule;;10:00;;;",
      "Déjà là;05/10/2026;;;;",
    ].join("\n");
    const existing = { ...NONE, tasks: [{ title: "Déjà LÀ", dueDate: "2026-10-05" }] };
    const [source] = await preview("tâches.csv", bytes(csv), existing);
    expect(source!.ignored).toEqual(["Couleur"]);
    const rows = source!.rows;
    expect(rows.map((r) => r.errors)).toEqual([[], ["Titre manquant."], ["Date impossible : « 32/10/2026 »."], [], [], ["Heure sans échéance."], []]);
    expect(rows[3]).toMatchObject({ duplicate: "Doublon de la ligne 2.", checked: false });
    expect(rows[4]).toMatchObject({ warnings: ["Espace inconnu : « Maison »."], checked: true });
    expect(rows[4]!.item).toMatchObject({ input: { spaceId: "perso", inbox: true } });
    expect(rows[6]).toMatchObject({ duplicate: "Déjà dans Aqueli.", checked: false });
    expect(rows[0]!.details).toEqual(["Perso", "Priorité haute"]);
  });

  it("vérifie les événements et les obligations", async () => {
    const csv = [
      "Type;Titre;Date;Début;Fin;Échéance;Préavis;Montant;Catégorie",
      "Événement;Réunion;12/10/2026;14:00;13:00;;;;",
      "Événement;Salon;12/10/2026;;;;;;",
      "Obligation;Assurance auto;;;;15/11/2026;20/11/2026;;",
      "Obligation;Loyer;;;;01/10/2026;;850;Logement",
      "Obligation;Impôts;;;;15/10/2026;;;impôts",
      "Obligation;Gym;;;;15/10/2026;;;Sport",
      "Dépense;Pain;;;;;;;",
      "Truc;Autre;;;;;;;",
    ].join("\n");
    const [source] = await preview("import.csv", bytes(csv));
    expect(source!.source).toMatchObject({ kind: "mixed" });
    const rows = source!.rows;
    expect(rows[0]!.errors).toEqual(["La fin précède le début."]);
    expect(rows[1]!.item).toMatchObject({ input: { startTime: null, endDate: "2026-10-12" } });
    expect(rows[2]!.errors).toEqual(["Le préavis suit l'échéance."]);
    expect(rows[3]!.item).toMatchObject({ input: { category: "logement", amountCents: 85000, periodMonths: null } });
    expect(rows[4]!.item).toMatchObject({ input: { category: "impots" } });
    expect(rows[5]).toMatchObject({ warnings: ["Catégorie inconnue : « Sport ». Classée dans Factures."], checked: true });
    expect(rows[6]).toMatchObject({ kind: "transaction", errors: ["Date manquante.", "Montant manquant."] });
    expect(rows[7]!.errors).toEqual(["Type inconnu : « Truc »."]);
  });

  it("le type d'un tableau peut être changé dans l'aperçu", async () => {
    const csv = "Titre;Date\nDentiste;08/10/2026 09:30\n";
    const [asTasks] = await preview("liste.csv", bytes(csv));
    expect(asTasks!.source).toMatchObject({ kind: "task", guessed: true });
    const [asEvents] = await preview("liste.csv", bytes(csv), NONE, { csv: "event" });
    expect(asEvents!.rows[0]!.item).toMatchObject({ kind: "event", input: { startTime: "09:30", endTime: "10:30", reminder: 15 } });
  });

  it("refuse un format inconnu ou un fichier vide", async () => {
    await expect(readImportFile("photo.jpg", bytes("x"))).rejects.toThrow(/Format non pris en charge/);
    await expect(readImportFile("vide.csv", bytes("Titre;Date\n"))).rejects.toThrow(/Aucun élément/);
  });
});

describe("budget et listes", () => {
  it("lit un relevé de banque : montants signés, débit et crédit, catégories", async () => {
    const releve = ["Date;Libellé;Montant", "26/09/2026;CB MARCHE;-42,50", "01/10/2026;VIR SALAIRE;+2.450,00", "02/10/2026;Retrait;-1 234,56 €", "03/10/2026;Rien;0"].join("\n");
    const rows = rowsOf(await preview("export.csv", bytes(releve)));
    expect(rows.map((r) => r.kind)).toEqual(["transaction", "transaction", "transaction", "transaction"]);
    expect(rows[0]!.item).toMatchObject({ input: { day: "2026-09-26", amountCents: 4250, kind: "depense", label: "CB MARCHE", categoryId: null } });
    expect(rows[1]!.item).toMatchObject({ input: { amountCents: 245000, kind: "revenu" } });
    expect(rows[2]!.item).toMatchObject({ input: { amountCents: 123456, kind: "depense" } });
    expect(rows[3]!.errors).toEqual(["Montant nul."]);

    const colonnes = ["Date;Libellé;Débit;Crédit;Catégorie", "28/09/2026;Essence;68,20;;Transports", "01/10/2026;Salaire;;2450;Salaire", "02/10/2026;Erreur;10;10;"].join("\n");
    const [essence, salaire, erreur] = rowsOf(await preview("releve.csv", bytes(colonnes)));
    expect(essence!.item).toMatchObject({ input: { amountCents: 6820, kind: "depense", categoryId: "cat-transports" } });
    expect(salaire!.item).toMatchObject({ input: { amountCents: 245000, kind: "revenu", categoryId: "cat-salaire" } });
    expect(erreur!.errors).toEqual(["Débit et crédit sur la même ligne."]);

    // Sans montant négatif dans le tableau, un montant est une dépense ; doublon d'une opération existante.
    const simple = ["Date;Libellé;Montant;Catégorie", "26/09/2026;Marché;42,50;Course", "27/09/2026;Cadeau;30;Inconnue"].join("\n");
    const existing = { ...NONE, transactions: [{ label: "Marché", day: "2026-09-26", kind: "depense" as const, amountCents: 4250 }] };
    const [marche, cadeau] = rowsOf(await preview("dépenses.csv", bytes(simple), existing));
    expect(marche).toMatchObject({ duplicate: "Déjà dans Aqueli.", checked: false, item: { input: { kind: "depense", categoryId: "cat-courses" } } });
    expect(cadeau!.warnings).toEqual(["Catégorie inconnue : « Inconnue »."]);
  });

  it("ajoute des éléments à une liste existante ou crée la liste avec ses colonnes", async () => {
    const lists = [
      {
        id: "l1",
        name: "Livres à lire",
        template: "livres",
        columns: [
          { id: "auteur", name: "Auteur", kind: "texte" },
          { id: "note", name: "Note", kind: "note" },
        ],
        sections: ["À lire", "Lus"],
      },
    ] as unknown as List[];
    const csv = [
      "Liste;Élément;Rayon;Auteur;Note;Prix",
      "livres a lire;Dune;Lus;Frank Herbert;★★★★☆;12",
      "Livres à lire;Fondation;Rayon inconnu;Asimov;4;",
      "Envies de déco;Lampe;Salon;;3;45,90",
      "Envies de déco;Tapis;;;;abc",
      ";Sans liste;;;;",
    ].join("\n");
    const file = await readImportFile("export.csv", bytes(csv));
    const rows = rowsOf(previewSources(file.sources, {}, { ...context({ ...NONE, listItems: [{ list: "Livres à lire", title: "Fondation" }] }), lists }));
    expect(rows[0]!.item).toMatchObject({ kind: "listItem", list: { id: "l1", input: null }, input: { title: "Dune", section: "Lus", cells: { auteur: "Frank Herbert", note: 4 } } });
    expect(rows[0]!.warnings).toEqual(["Colonne absente de la liste : « Prix »."]);
    expect(rows[1]).toMatchObject({ duplicate: "Déjà dans Aqueli.", warnings: ["Rayon inconnu de la liste : « Rayon inconnu ». Élément ajouté sans rayon."] });
    expect(rows[2]!.item).toMatchObject({
      list: { id: null, input: { name: "Envies de déco", template: "envies", sections: ["Salon"] } },
      input: { title: "Lampe", section: "Salon", cells: { prix: 4590, note: 3 } },
    });
    expect(rows[3]!.errors).toEqual(["Montant illisible : « abc »."]);
    expect(rows[4]!.errors).toEqual(["Liste manquante."]);
    // Liste nouvelle : les colonnes remplies du tableau rejoignent celles du modèle.
    const created = (rows[2]!.item as { list: { input: { columns: { name: string; kind: string }[] } } }).list.input.columns;
    expect(created.map((c) => `${c.name}:${c.kind}`)).toEqual(["Prix:prix", "Priorité:note", "Lien:lien", "Note:note"]);
    const { batch, origin } = toBatch(rows.filter((r) => r.item));
    expect(batch.lists.map((l) => [l.listId, l.list?.name ?? null, l.items.length])).toEqual([
      ["l1", null, 2],
      [null, "Envies de déco", 1],
    ]);
    expect(origin.listItem.map((r) => r.line)).toEqual([2, 3, 4]);
  });
});

describe("agendas et carnets de contacts", () => {
  it("lit les événements d'un fichier .ics", async () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "SUMMARY:Dentiste\\, contrôle",
      "DTSTART;TZID=Europe/Paris:20261008T093000",
      "DTEND;TZID=Europe/Paris:20261008T100000",
      "LOCATION:Cabinet Martin",
      "DESCRIPTION:Apporter la carte\\nVitale.",
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "END:VALARM",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:Week-end à la mer",
      "DTSTART;VALUE=DATE:20261017",
      "DTEND;VALUE=DATE:20261019",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:Cours de yoga",
      "DTSTART:20261005T170000Z",
      "DURATION:PT1H30M",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,TH",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:Annulé",
      "STATUS:CANCELLED",
      "DTSTART;VALUE=DATE:20261020",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:Réunion d'équ",
      " ipe",
      "DTSTART;VALUE=DATE:20261021",
      "RRULE:FREQ=MONTHLY;BYDAY=MO,TU",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const rows = rowsOf(await preview("agenda.ics", bytes(ics)));
    expect(rows.map((r) => r.title)).toEqual(["Dentiste, contrôle", "Week-end à la mer", "Cours de yoga", "Réunion d'équipe"]);
    expect(rows[0]!.item).toMatchObject({
      kind: "event",
      input: { startDate: "2026-10-08", startTime: "09:30", endTime: "10:00", location: "Cabinet Martin", notes: "Apporter la carte\nVitale.", reminder: 60 },
    });
    expect(rows[1]!.item).toMatchObject({ input: { startDate: "2026-10-17", endDate: "2026-10-18", startTime: null } });
    const utc = new Date(Date.UTC(2026, 9, 5, 17, 0));
    const two = (n: number) => String(n).padStart(2, "0");
    expect(rows[2]!.item).toMatchObject({ input: { startTime: `${two(utc.getHours())}:${two(utc.getMinutes())}`, recurrence: { kind: "weekly", interval: 1, days: [1, 4] } } });
    expect(rows[3]).toMatchObject({ warnings: ["Répétition non reprise : à régler dans le calendrier."], checked: true });
    expect(repeatFromRule("FREQ=MONTHLY;BYDAY=2TU")).toBe("le 2e mardi du mois");
    expect(repeatFromRule("FREQ=DAILY;INTERVAL=3")).toBe("tous les 3 jours");
  });

  it("lit les contacts d'un fichier .vcf, vCard 2.1 et 3.0", async () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Bernard;Léa;;;",
      "FN:Léa Bernard",
      "TEL;TYPE=CELL:06 12 34 56 78",
      "TEL;TYPE=HOME:01 44 55 66 77",
      "item1.EMAIL;TYPE=INTERNET:lea@exemple.fr",
      "ADR;TYPE=HOME:;;12 rue des Lilas;Paris;;75011;France",
      "BDAY:2016-05-14",
      "NOTE:Préfère les SMS\\, le soir.",
      "CATEGORIES:Famille,myContacts,Club de tennis",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Dupont;;;;",
      "ORG;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Garage Dupont =C3=A0 Lyon",
      "TEL;WORK;VOICE:04 78 00 00 00",
      "BDAY:--0321",
      "END:VCARD",
    ].join("\r\n");
    const rows = rowsOf(await preview("contacts.vcf", bytes(vcf)));
    expect(rows.filter((r) => r.errors.length || r.warnings.length)).toEqual([]);
    expect(rows[0]!.item).toMatchObject({
      kind: "contact",
      input: {
        firstName: "Léa",
        lastName: "Bernard",
        phones: [{ value: "06 12 34 56 78" }, { value: "01 44 55 66 77" }],
        emails: [{ value: "lea@exemple.fr" }],
        address: "12 rue des Lilas\n75011 Paris\nFrance",
        birthday: "2016-05-14",
        notes: "Préfère les SMS, le soir.",
        tags: ["Famille", "Club-de-tennis"],
      },
    });
    expect(rows[1]!.item).toMatchObject({ input: { lastName: "Dupont", company: "Garage Dupont à Lyon", birthday: "--03-21" } });
  });
});

describe("Markdown", () => {
  it("convertit titres, listes, cases, citations et marques", () => {
    const doc = markdownToDoc("## Courses\nAcheter **du pain** et *du lait*\nvite\n\n- [x] fait\n- [ ] à faire\n1. un\n2. deux\n> cité\n---\n```\ncode\n```");
    expect(doc.content!.map((n) => n.type)).toEqual(["heading", "paragraph", "taskList", "orderedList", "blockquote", "horizontalRule", "codeBlock"]);
    expect(doc.content![0]).toEqual({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Courses" }] });
    expect(doc.content![1]!.content).toEqual([
      { type: "text", text: "Acheter " },
      { type: "text", text: "du pain", marks: [{ type: "bold" }] },
      { type: "text", text: " et " },
      { type: "text", text: "du lait", marks: [{ type: "italic" }] },
      { type: "hardBreak" },
      { type: "text", text: "vite" },
    ]);
    expect(doc.content![2]!.content![0]).toMatchObject({ type: "taskItem", attrs: { checked: true } });
  });
});

describe("fichiers en anglais", () => {
  it("reconnaît les colonnes et les valeurs anglaises des tâches", async () => {
    const csv = [
      "Title;Due date;Time;Priority;Tags;Space;Reminder;Repeat",
      "Call the garage;03/10/2026;2pm;high;car;Perso;15 min before;",
      "Water the plants;tomorrow;;low;;;none;every Monday",
    ].join("\n");
    const [source] = await preview("tasks.csv", bytes(csv));
    expect(source!.rows.every((r) => r.kind === "task")).toBe(true);
    expect(source!.ignored).toEqual([]);
    const rows = source!.rows;
    expect(rows.map((r) => r.errors)).toEqual([[], []]);
    expect(rows[0]!.item).toMatchObject({ input: { title: "Call the garage", dueDate: "2026-10-03", dueTime: "14:00", priority: 3, tags: ["car"], spaceId: "perso", reminder: 15 } });
    expect(rows[1]!.item).toMatchObject({ input: { title: "Water the plants", dueDate: "2026-09-30", priority: 1, recurrence: { kind: "weekly", days: [1] } } });
  });

  it("reconnaît les types et les valeurs anglaises des autres éléments", () => {
    expect(kindFromWord("Expenses")).toEqual({ kind: "transaction" });
    expect(kindFromWord("Appointments")).toEqual({ kind: "event" });
    expect(kindFromHeaders(["First name", "Last name", "Phone", "Email"])).toBe("contact");
    expect(kindFromHeaders(["Date", "Description", "Amount", "Category"])).toBe("transaction");
    expect(parsePeriod("quarterly")).toBe(3);
    expect(parsePeriod("every 6 months")).toBe(6);
    expect(parsePriority("Priority medium")).toBe(2);
    expect(parseReminder("1 hour before")).toBe(60);
    expect(parseDuration("2 days")).toBe(2 * 24 * 60);
    expect(parseHabitFrequency("3 times a week")).toEqual({ kind: "semaine", times: 3 });
    expect(parseHabitFrequency("Mon, Wed and Fri")).toEqual({ kind: "jours", days: [1, 3, 5] });
    expect(parseHabitFrequency("weekdays")).toEqual({ kind: "jours", days: [1, 2, 3, 4, 5] });
    expect(parseBirthday("14 May 1990")).toBe("1990-05-14");
    expect(parseBirthday("May 14")).toBe("--05-14");
    expect(parseDay("tomorrow", opts)).toBe("2026-09-30");
    expect(parseTime("2:30pm")).toBe("14:30");
  });
});

describe("guide d'import en anglais", () => {
  /** Compte créé en anglais : espaces, catégories du budget et des obligations à leur nom anglais. */
  const SPACE_EN: Record<string, string> = { perso: "Personal", travail: "Work", sante: "Health", famille: "Family" };
  const BUDGET_EN: Record<string, string> = {
    "cat-courses": "Groceries",
    "cat-logement": "Housing",
    "cat-transports": "Transport",
    "cat-loisirs": "Leisure",
    "cat-salaire": "Salary",
    "cat-autres-revenus": "Other income",
  };
  const contextEn = (): ImportContext => ({
    ...context(),
    spaces: SPACES.map((s) => ({ ...s, name: SPACE_EN[s.id] ?? s.name })),
    budgetCategories: BUDGET.map((b) => ({ ...b, name: BUDGET_EN[b.id] ?? b.name })),
    categories: CATEGORIES.map((c) => ({ ...c, label: EN[c.label] ?? c.label })),
    notebooks: [],
  });
  const SHEETS: [ImportKind, string, string][] = [
    ["task", "Tasks", "Template tasks.csv"],
    ["event", "Events", "Template events.csv"],
    ["obligation", "Obligations", "Template obligations.csv"],
    ["note", "Notes", "Template notes.csv"],
    ["habit", "Habits", "Template habits.csv"],
    ["contact", "Contacts", "Template contacts.csv"],
    ["transaction", "Expenses", "Template expenses.csv"],
    ["listItem", "Lists", "Template lists.csv"],
  ];
  const headersOf = (name: string) => parseCsv(decodeText(readFileSync(`src-tauri/guide/en/${name}`)))[0]!.cells;

  it("les modèles ont les mêmes colonnes que les modèles français, à leur nom anglais", () => {
    for (const [kind, sheet, name] of SHEETS) {
      const headers = headersOf(name);
      expect(headers.map((h) => fieldOf(kind, h))).toEqual(COLUMNS[kind].map((c) => c.field));
      if (kind === "listItem") expect(kindFromHeaders(headers)).toBe(kind);
      else expect(kindFromWord(name, false)).toEqual({ kind });
      expect(kindFromWord(sheet)).toEqual({ kind });
    }
  });

  it("le guide décrit chaque colonne des modèles", () => {
    const guide = readFileSync("src-tauri/guide/en/README.html", "utf8");
    for (const [, , name] of SHEETS) for (const header of headersOf(name)) expect(guide).toContain(`<td class="col">${header}`);
  });

  it("le guide de chaque langue décrit chaque colonne des modèles, à leur nom anglais", () => {
    const english = readFileSync("src-tauri/guide/en/README.html", "utf8");
    const sections = (html: string) => [...html.matchAll(/<h[23] id="([\w-]+)"/g)].map((m) => m[1]);
    for (const { id } of LANGUAGES.filter((l) => l.id !== "fr" && l.id !== "en")) {
      const guide = readFileSync(`src-tauri/guide/${id}/README.html`, "utf8");
      expect(guide, id).toMatch(new RegExp(`^<!doctype html>\\n<html lang="${id}`));
      for (const [, , name] of SHEETS) for (const header of headersOf(name)) expect(guide, `${id} ${header}`).toContain(`<td class="col">${header}`);
      // Mêmes sections que le guide anglais, et le même exemple de fichier texte.
      expect(sections(guide), id).toEqual(sections(english));
      expect(guide.match(/<pre>[\s\S]*?<\/pre>/)?.[0], id).toBe(english.match(/<pre>[\s\S]*?<\/pre>/)?.[0]);
    }
  });

  it("les lignes du classeur d'exemple s'importent sans erreur ni avertissement", () => {
    for (const [kind, sheet] of SHEETS) {
      const [header, ...rows] = parseCsv(readFileSync(`src-tauri/guide/en/examples/${sheet}.tsv`, "utf8"));
      expect(header!.cells).toEqual(headersOf(SHEETS.find(([k]) => k === kind)![2]));
      const built = buildRows(sheet, tableRecords(header!.cells, rows, kind), contextEn(), new Set(), new Map());
      expect(built.filter((r) => r.errors.length || r.warnings.length || !r.checked).map((r) => [r.title, r.errors, r.warnings])).toEqual([]);
      expect(built.every((r) => r.item?.kind === kind)).toBe(true);
    }
  });

  it("lit l'exemple de fichier texte sans erreur", async () => {
    const file = await readImportFile("Example.txt", readFileSync("src-tauri/guide/en/Example.txt"));
    const rows = rowsOf(previewSources(file.sources, {}, contextEn()));
    expect(rows).toHaveLength(13);
    expect(rows.filter((r) => r.errors.length || r.warnings.length).map((r) => [r.title, r.errors, r.warnings])).toEqual([]);
    const [garage, , plants, dentist, , insurance, , , read, lea, groceries, salary, milk] = rows.map((r) => r.item);
    expect(garage).toMatchObject({ kind: "task", input: { title: "Call the garage", dueDate: "2026-10-03", dueTime: "14:00", tags: ["car"], priority: 3, spaceId: "perso" } });
    expect(plants).toMatchObject({ kind: "task", input: { recurrence: { kind: "weekly", interval: 1 } } });
    expect(dentist).toMatchObject({ kind: "event", input: { startDate: "2026-10-08", startTime: "09:30", endTime: "10:00", location: "Martin surgery", spaceId: "sante" } });
    expect(insurance).toMatchObject({ kind: "obligation", input: { category: "assurances", amountCents: 31200, periodMonths: 12, dueDate: "2026-11-15" } });
    expect(read).toMatchObject({ kind: "habit", input: { name: "Read", target: 20, unit: "pages", reminder: "21:30" } });
    expect(lea).toMatchObject({ kind: "contact" });
    expect(groceries).toMatchObject({ kind: "transaction", input: { amountCents: 4250, kind: "depense", categoryId: "cat-courses" } });
    expect(salary).toMatchObject({ kind: "transaction", input: { amountCents: 245000, kind: "revenu", categoryId: "cat-salaire" } });
    expect(milk).toMatchObject({ kind: "listItem", list: { name: "Shopping", input: { template: "courses" } }, input: { title: "Milk", section: "Fresh" } });
  });

  it("lit les montants écrits à l'anglaise", () => {
    expect(parseMoney("€312")).toBe(31200);
    expect(parseMoney("2,450.00")).toBe(245000);
    expect(parseMoney("1.234,56 €")).toBe(123456);
    expect(parseMoney("19.99")).toBe(1999);
  });
});

describe("valeurs citées par le guide anglais", () => {
  it("dates, heures, durées et rappels", () => {
    for (const d of ["03/10/2026", "3/10/26", "2026-10-03", "3 October 2026"]) expect(parseDay(d, opts)).toBe("2026-10-03");
    expect(parseDay("03/10", opts)).toBe("2026-10-03");
    expect(parseDay("today", opts)).toBe("2026-09-29");
    expect(parseDay("Monday", opts)).toBe("2026-10-05");
    expect(parseDay("in 3 days", opts)).toBe("2026-10-02");
    for (const [t, v] of [["14:00", "14:00"], ["2pm", "14:00"], ["2:30pm", "14:30"], ["noon", "12:00"]]) expect(parseTime(t!)).toBe(v);
    expect(parseDateTime("08/10/2026 09:30-10:00", opts)).toMatchObject({ day: "2026-10-08", start: "09:30", end: "10:00" });
    expect(parseDuration("15 min")).toBe(15);
    expect(parseDuration("1 h 30")).toBe(90);
    expect(parseDuration("2 days")).toBe(2880);
    expect(parseReminder("on time")).toBe(0);
    expect(parseReminder("none")).toBe(null);
  });

  it("répétitions, fréquences, anniversaires, priorités, périodicités", () => {
    for (const r of ["every day", "every 2 days", "weekdays", "every Monday", "every Monday and Thursday", "every week", "every 2 weeks", "every month", "every 3 months", "the first Monday of the month", "every year"]) {
      expect(isBad(parseRepeat(r, today, false)), r).toBe(false);
    }
    expect(parseRepeat("3 days after completion", today, true)).toMatchObject({ kind: "afterDone", days: 3 });
    for (const f of ["every day", "3 times a week", "Mon, Wed, Fri", "Tuesday and Thursday", "weekdays", "weekends"]) expect(isBad(parseHabitFrequency(f)), f).toBe(false);
    expect(parseBirthday("14 May 1990")).toBe("1990-05-14");
    expect(parseBirthday("14/05")).toBe("--05-14");
    expect(parsePriority("high")).toBe(3);
    expect(parsePriority("none")).toBe(0);
    for (const [p, n] of [["one-off", null], ["monthly", 1], ["every two months", 2], ["quarterly", 3], ["half-yearly", 6], ["yearly", 12]] as const) expect(parsePeriod(p)).toBe(n);
  });
});
