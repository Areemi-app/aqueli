/**
 * Données créées avec le compte : le cœur nomme en français les espaces et les catégories du
 * budget proposés au départ. À chaque ouverture du compte, ceux que la personne n'a pas renommés
 * prennent le nom de la langue de l'interface (et la suivent quand elle change). Les derniers noms
 * posés par Aqueli sont retenus dans les préférences, pour reconnaître un nom resté tel quel.
 */
import { budgetApi } from "../budget/api";
import { spacesApi } from "../spaces/api";
import { readPref, writePref } from "../lib/storage";
import { tr } from "./i18n";

/** Identifiant → [nom français écrit par le cœur, nom affiché]. */
const SPACE_NAMES: Record<string, readonly [string, string]> = {
  perso: ["Perso", tr("Perso")],
  travail: ["Travail", tr("Travail")],
  sante: ["Santé", tr("Santé")],
  famille: ["Famille", tr("Famille")],
};

const CATEGORY_NAMES: Record<string, readonly [string, string]> = {
  "cat-courses": ["Courses", tr("Courses|budget")],
  "cat-logement": ["Logement", tr("Logement")],
  "cat-transports": ["Transports", tr("Transports")],
  "cat-sante": ["Santé", tr("Santé")],
  "cat-loisirs": ["Loisirs", tr("Loisirs")],
  "cat-restaurants": ["Restaurants", tr("Restaurants")],
  "cat-vetements": ["Vêtements", tr("Vêtements")],
  "cat-cadeaux": ["Cadeaux", tr("Cadeaux")],
  "cat-divers": ["Divers", tr("Divers")],
  "cat-salaire": ["Salaire", tr("Salaire")],
  "cat-autres-revenus": ["Autres revenus", tr("Autres revenus")],
  "cat-activite": ["Activité indépendante", tr("Activité indépendante")],
  "cat-aides": ["Aides et allocations", tr("Aides et allocations")],
  "cat-remboursements": ["Remboursements", tr("Remboursements")],
  "cat-ventes": ["Ventes", tr("Ventes")],
  "cat-cadeaux-recus": ["Cadeaux reçus", tr("Cadeaux reçus")],
  "cat-placements": ["Épargne et placements", tr("Épargne et placements")],
};

const PREF = "nomsDepart";

type Applied = Record<string, string>;
const isApplied = (v: unknown): v is Applied =>
  typeof v === "object" && v !== null && Object.values(v).every((x) => typeof x === "string");

/**
 * Nom à remplacer : le nom français d'origine, le dernier nom posé par Aqueli, ou le nom anglais
 * (comptes créés en anglais avant que ces noms ne soient retenus).
 */
const untouched = (name: string, names: readonly [string, string], applied: string | undefined, english: Readonly<Record<string, string>>) =>
  name === names[0] || name === applied || name === english[names[0]];

/** Renomme les espaces et les catégories de départ restés tels quels dans la langue de l'interface. */
export async function localizeDefaults(): Promise<void> {
  const applied: Applied = { ...readPref<Applied>(PREF, {}, isApplied) };
  const { EN } = await import("./en");
  const english = { ...EN, Courses: EN["Courses|budget"] ?? "Courses" };
  for (const s of await spacesApi.list()) {
    const names = SPACE_NAMES[s.id];
    if (!names || !untouched(s.name, names, applied[`espace:${s.id}`], english)) continue;
    if (s.name !== names[1]) await spacesApi.update(s.id, names[1], s.color, s.icon);
    applied[`espace:${s.id}`] = names[1];
  }
  for (const c of await budgetApi.categories()) {
    const names = CATEGORY_NAMES[c.id];
    if (!names || !untouched(c.name, names, applied[`categorie:${c.id}`], english)) continue;
    if (c.name !== names[1]) {
      await budgetApi.updateCategory(c.id, { name: names[1], kind: c.kind, color: c.color, icon: c.icon, monthlyCents: c.monthlyCents });
    }
    applied[`categorie:${c.id}`] = names[1];
  }
  writePref(PREF, applied);
}
