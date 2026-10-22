import { describe, expect, it } from "vitest";
import { COLUMNS, ID_COLUMN } from "../import/fields";
import type { ImportContext } from "../import/records";
import { previewSources, readImportFile } from "../import/sources";
import type { BudgetCategory, Transaction } from "./budget";
import { BUDGET_CSV_COLUMNS, toBudgetCsv } from "./exportCsv";

const categories = [
  { id: "cat-courses", name: "Courses", kind: "depense" },
  { id: "cat-salaire", name: "Salaire", kind: "revenu" },
] as unknown as BudgetCategory[];
const spaces = [{ id: "perso", name: "Perso" }];

const op = (t: Partial<Transaction>): Transaction => ({
  id: "t",
  day: "2026-10-03",
  amountCents: 4250,
  kind: "depense",
  categoryId: "cat-courses",
  label: "Marché; du samedi",
  notes: "",
  spaceId: "perso",
  createdAt: 0,
  updatedAt: 0,
  repeatMonths: null,
  repeatUntil: null,
  repeatNext: null,
  seriesId: null,
  ...t,
});

const ctx: ImportContext = {
  now: new Date(2026, 9, 5),
  today: "2026-10-05",
  date1904: false,
  spaces: spaces as unknown as ImportContext["spaces"],
  defaultSpaceId: null,
  notebooks: [],
  categories: [],
  defaultReminder: null,
  budgetCategories: categories,
  existing: { tasks: [], events: [], obligations: [], notes: [] },
};

describe("export des opérations du budget", () => {
  it("reprend les colonnes du modèle d'import « Dépenses »", () => {
    expect([...BUDGET_CSV_COLUMNS]).toEqual([...COLUMNS.transaction, ID_COLUMN].map((c) => c.names[0]));
  });

  it("écrit un tableau que l'import relit tel quel", async () => {
    const csv = toBudgetCsv(
      [op({}), op({ id: "s", day: "2026-10-01", amountCents: 245000, kind: "revenu", categoryId: "cat-salaire", label: "Salaire", notes: "Prime \"exceptionnelle\"\nincluse", createdAt: 1, repeatMonths: 1, repeatUntil: "2027-12-31" })],
      categories,
      spaces,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const file = await readImportFile("budget.csv", new TextEncoder().encode(csv));
    const rows = previewSources(file.sources, {}, ctx).flatMap((s) => s.rows);
    // Relu dans un compte vide : seul l'identifiant, inconnu ici, est signalé (un nouvel élément sera créé).
    expect(rows.filter((r) => r.errors.length || r.warnings.some((w) => !w.startsWith("Identifiant inconnu")))).toEqual([]);
    expect(rows.map((r) => r.item)).toMatchObject([
      { kind: "transaction", input: { day: "2026-10-01", amountCents: 245000, kind: "revenu", categoryId: "cat-salaire", label: "Salaire", notes: "Prime \"exceptionnelle\"\nincluse", spaceId: "perso", repeatMonths: 1, repeatUntil: "2027-12-31" } },
      { kind: "transaction", input: { day: "2026-10-03", amountCents: 4250, kind: "depense", categoryId: "cat-courses", label: "Marché; du samedi", repeatMonths: null, repeatUntil: null } },
    ]);
  });
});
