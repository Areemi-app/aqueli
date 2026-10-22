import { tr } from "../i18n/i18n";
/**
 * Erreurs des opérations sur les données (src-tauri/src/data/mod.rs), traduites en
 * messages courts pour l'interface.
 */

export type DataError =
  | { code: "locked" }
  | { code: "notFound" }
  | { code: "invalid"; field: string }
  | { code: "duplicate"; field: string }
  | { code: "lastSpace" }
  | { code: "tooMany"; max: number }
  | { code: "database"; detail: string };

export function asDataError(value: unknown): DataError {
  if (typeof value === "object" && value !== null && typeof (value as { code?: unknown }).code === "string") {
    return value as DataError;
  }
  return { code: "database", detail: typeof value === "string" ? value : "erreur inattendue" };
}

const INVALID_FIELDS: Record<string, string> = {
  name: tr("Le nom doit contenir de 1 à 40 caractères."),
  color: tr("Couleur non valide."),
  icon: tr("Icône non valide."),
  title: tr("Le titre doit contenir de 1 à 500 caractères."),
  notes: tr("Description trop longue (20 000 caractères au plus)."),
  space: tr("Espace introuvable."),
  dueDate: tr("Date non valide."),
  dueTime: tr("Heure non valide."),
  priority: tr("Priorité non valide."),
  estimate: tr("Durée non valide (24 h au plus)."),
  tags: tr("Étiquette non valide. Utilisez des lettres, des chiffres, « - », « _ » ou « / » (40 caractères et 20 étiquettes au plus)."),
  subtasks: tr("Sous-tâche non valide : de 1 à 300 caractères, 100 sous-tâches au plus."),
  reminder: tr("Rappel non valide (une semaine avant au plus)."),
  location: tr("Lieu trop long (300 caractères au plus)."),
  startDate: tr("Date de début non valide."),
  startTime: tr("Heure de début non valide."),
  endDate: tr("Date de fin non valide : après le début, un an au plus."),
  endTime: tr("La fin doit être après le début."),
  recurrence: tr("Répétition non valide."),
  repeatUntil: tr("La fin de la répétition doit suivre le début."),
  category: tr("Catégorie non valide."),
  status: tr("Statut non valide."),
  amount: tr("Montant non valide."),
  period: tr("Périodicité non valide."),
  cancelBy: tr("La date limite de résiliation doit précéder l'échéance."),
  organization: tr("Organisme trop long (200 caractères au plus)."),
  reference: tr("Référence trop longue (100 caractères au plus)."),
  label: tr("Le nom doit contenir de 1 à 40 caractères."),
  content: tr("Note trop volumineuse (8 Mo au plus, images comprises)."),
  plain: tr("Texte non valide."),
  links: tr("Liens entre notes non valides."),
  notebook: tr("Carnet introuvable."),
  parent: tr("Emplacement non valide : trois niveaux de carnets au plus."),
};

export function dataErrorMessage(error: DataError): string {
  switch (error.code) {
    case "locked":
      return tr("Aqueli est verrouillé.");
    case "notFound":
      return tr("Élément introuvable.");
    case "invalid":
      return INVALID_FIELDS[error.field] ?? tr("Valeur non valide.");
    case "duplicate":
      return tr("Un espace porte déjà ce nom.");
    case "lastSpace":
      return tr("Au moins un espace est nécessaire.");
    case "tooMany":
      return tr("{max} espaces au maximum.", { max: error.max });
    case "database":
      return tr("Erreur de la base de données ({detail}).", { detail: error.detail });
  }
}
