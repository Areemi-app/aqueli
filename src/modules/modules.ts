import { tr } from "../i18n/i18n";
/**
 * Les 15 modules d'Aqueli, dans l'ordre de la barre latérale (maquette BarreLaterale.dc.html),
 * rangés par catégorie. La couleur est l'identité du module (pastille), validée dans
 * docs/reference-projet.md.
 */

export type ModuleKey =
  | "accueil"
  | "taches"
  | "calendrier"
  | "obligations"
  | "notes"
  | "journal"
  | "habitudes"
  | "objectifs"
  | "projets"
  | "focus"
  | "listes"
  | "contacts"
  | "documents"
  | "bilan"
  | "budget";

export type Release = "1.0" | "2" | "3";

/** Catégories de la barre latérale. */
export type ModuleGroup = "quotidien" | "bien-etre" | "organisation" | "suivi";

export const MODULE_GROUPS: readonly { key: ModuleGroup; label: string }[] = [
  { key: "quotidien", label: tr("Quotidien") },
  { key: "bien-etre", label: tr("Bien-être") },
  { key: "organisation", label: tr("Organisation") },
  { key: "suivi", label: tr("Suivi") },
];

export interface ModuleDef {
  key: ModuleKey;
  /** Catégorie de la barre latérale ; l'Accueil n'en a pas et reste en tête. */
  group?: ModuleGroup;
  /** Mis en avant juste sous l'Accueil (Bilan, qui reprend le contenu des autres modules). */
  featured?: boolean;
  label: string;
  color: string;
  /** Tracé SVG de l'icône (grille 24 × 24, trait blanc). */
  icon: string;
  release: Release;
  /** Une phrase qui dit à quoi sert le module. */
  summary: string;
  /** Trois choses que le module permettra de faire. */
  features: [string, string, string];
}

export const MODULES: readonly ModuleDef[] = [
  {
    key: "accueil",
    label: tr("Accueil"),
    color: "#1e90e0",
    icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    release: "1.0",
    summary: tr("Vue d'ensemble de la journée."),
    features: [tr("Tâches du jour et rendez-vous"), tr("Obligations des 7 prochains jours"), tr("Widgets déplaçables")],
  },
  {
    key: "bilan",
    featured: true,
    label: tr("Bilan"),
    color: "#7a4fd0",
    icon: "M4 20V10 M10 20V4 M16 20v-7 M3 20h18",
    release: "3",
    summary: tr("Le point sur la semaine, les chiffres et le mois."),
    features: [tr("Revue hebdomadaire guidée"), tr("Graphiques de la semaine, du mois, de l'année"), tr("Rapport mensuel en PDF")],
  },
  {
    key: "taches",
    group: "quotidien",
    label: tr("Tâches"),
    color: "#2d6ff0",
    icon: "M4 4h16v16H4z M8 12l3 3 5-6",
    release: "1.0",
    summary: tr("Gestion des tâches, des échéances et des rappels."),
    features: [
      tr("Saisie en langage naturel"),
      tr("Récurrences, sous-tâches et rappels"),
      tr("Vues liste, Kanban et matrice"),
    ],
  },
  {
    key: "calendrier",
    group: "quotidien",
    label: tr("Calendrier"),
    color: "#2fae4a",
    icon: "M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5",
    release: "1.0",
    summary: tr("Agenda, tâches datées, obligations et anniversaires."),
    features: [tr("Vues jour, semaine, mois et année"), tr("Jours fériés et vacances scolaires"), tr("Déplacement des rendez-vous à la souris")],
  },
  {
    key: "obligations",
    group: "quotidien",
    label: tr("Obligations"),
    color: "#e0671f",
    icon: "M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h5",
    release: "1.0",
    summary: tr("Factures, contrats, impôts et démarches administratives."),
    features: [tr("Rappels à J-30, J-7 et J-1"), tr("Alerte de date limite de résiliation"), tr("Frise de l'année et total des abonnements")],
  },
  {
    key: "notes",
    group: "quotidien",
    label: tr("Notes"),
    color: "#e3a712",
    icon: "M4 4h16v10l-6 6H4z M14 20v-6h6",
    release: "1.0",
    summary: tr("Prise de notes et carnets."),
    features: [tr("Titres, listes, cases à cocher et tableaux"), tr("Carnets, étiquettes et liens entre notes"), tr("Historique des versions")],
  },
  {
    key: "journal",
    group: "bien-etre",
    label: tr("Journal"),
    color: "#c2479a",
    icon: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11",
    release: "2",
    summary: tr("Journal quotidien et suivi de l'humeur."),
    features: [tr("Une page par jour"), tr("Humeur, énergie et gratitudes"), tr("Rappel « Il y a un an »")],
  },
  {
    key: "habitudes",
    group: "bien-etre",
    label: tr("Habitudes"),
    color: "#16a3a3",
    icon: "M4 12a8 8 0 0 1 14-5l2 2 M20 4v5h-5 M20 12a8 8 0 0 1-14 5l-2-2 M4 20v-5h5",
    release: "2",
    summary: tr("Suivi des habitudes et des routines."),
    features: [tr("Habitudes oui/non ou chiffrées"), tr("Séries et records"), tr("Carte de l'année")],
  },
  {
    key: "focus",
    group: "bien-etre",
    label: tr("Focus"),
    color: "#0a9cc4",
    icon: "M4 13a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M12 9v4l3 2 M9 2h6",
    release: "2",
    summary: tr("Minuteur de concentration."),
    features: [tr("Cycles 25/5, 50/10 ou sur mesure"), tr("Ambiances sonores apaisantes"), tr("Temps passé enregistré sur la tâche")],
  },
  {
    key: "projets",
    group: "organisation",
    label: tr("Projets"),
    color: "#6d5ce0",
    icon: "M3 6h6l2 2h10v11H3z",
    release: "2",
    summary: tr("Tâches, notes et documents regroupés par projet."),
    features: [tr("Tâches, notes et documents du projet"), tr("Avancement en pourcentage"), tr("Modèles réutilisables")],
  },
  {
    key: "listes",
    group: "organisation",
    label: tr("Listes"),
    color: "#7f9a14",
    icon: "M9 6h11 M9 12h11 M9 18h11 M4 6h1 M4 12h1 M4 18h1",
    release: "3",
    summary: tr("Listes de courses, lectures, films et idées cadeaux."),
    features: [tr("Modèles de listes"), tr("Colonnes personnalisables"), tr("Vue liste ou galerie")],
  },
  {
    key: "contacts",
    group: "organisation",
    label: tr("Contacts"),
    color: "#d9567a",
    icon: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
    release: "2",
    summary: tr("Carnet d'adresses."),
    features: [tr("Anniversaires au calendrier"), tr("Historique des échanges liés"), tr("Import et export .vcf")],
  },
  {
    key: "documents",
    group: "organisation",
    label: tr("Documents"),
    color: "#3d6fb8",
    icon: "M12 3l8 3v6c0 5-3.5 8-8 9c-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
    release: "2",
    summary: tr("Stockage chiffré des documents importants."),
    features: [tr("Ajout de fichiers par glisser-déposer"), tr("Date d'expiration avec rappel"), tr("Aperçu des PDF et images")],
  },
  {
    key: "objectifs",
    group: "suivi",
    label: tr("Objectifs"),
    color: "#e04848",
    icon: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M7 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0",
    release: "3",
    summary: tr("Objectifs, étapes et progression."),
    features: [tr("Objectifs chiffrés et étapes"), tr("Progression calculée automatiquement"), tr("Horizons année, trimestre, mois")],
  },
  {
    key: "budget",
    group: "suivi",
    label: tr("Budget"),
    color: "#1f9a6e",
    icon: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3z M3 7l12-3v3 M16 13h2",
    release: "3",
    summary: tr("Suivi des dépenses et des abonnements."),
    features: [tr("Budget mensuel par catégorie"), tr("Reprise des abonnements des Obligations"), tr("Import d'un relevé Excel ou .csv")],
  },
];

export function isModuleKey(value: unknown): value is ModuleKey {
  return MODULES.some((m) => m.key === value);
}

/** Modules de la barre latérale, sans ceux masqués dans les Paramètres (l'Accueil reste). */
export function visibleModules(hidden: readonly ModuleKey[]): ModuleDef[] {
  return MODULES.filter((m) => m.key === "accueil" || !hidden.includes(m.key));
}

export function getModule(key: ModuleKey): ModuleDef {
  const found = MODULES.find((m) => m.key === key);
  if (!found) throw new Error(`Module inconnu : ${key}`);
  return found;
}
