/**
 * Données créées avec le compte : le cœur nomme en français les espaces et les catégories du
 * budget proposés au départ. Un compte créé en anglais les renomme aussitôt ; un nom que la
 * personne a déjà changé est gardé.
 */
import { budgetApi } from "../budget/api";
import { spacesApi } from "../spaces/api";
import { lang, tr } from "./i18n";

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

/** Renomme les espaces et les catégories de départ dans la langue de l'interface. */
export async function localizeDefaults(): Promise<void> {
  if (lang() === "fr") return;
  for (const s of await spacesApi.list()) {
    const names = SPACE_NAMES[s.id];
    if (names && s.name === names[0] && names[1] !== names[0]) await spacesApi.update(s.id, names[1], s.color, s.icon);
  }
  for (const c of await budgetApi.categories()) {
    const names = CATEGORY_NAMES[c.id];
    if (names && c.name === names[0] && names[1] !== names[0]) {
      await budgetApi.updateCategory(c.id, { name: names[1], kind: c.kind, color: c.color, icon: c.icon, monthlyCents: c.monthlyCents });
    }
  }
}
