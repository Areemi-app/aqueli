/**
 * Types d'éléments importés et colonnes reconnues, avec leurs synonymes français et anglais
 * (majuscules et accents indifférents). Les modèles du guide d'import (src-tauri/guide) reprennent le premier nom de
 * chaque colonne. Fonctions pures.
 */
import { key } from "./values";
import { tr } from "../i18n/i18n";

export type ImportKind = "task" | "event" | "obligation" | "note" | "habit" | "contact" | "transaction" | "listItem";

export const KINDS: readonly ImportKind[] = ["task", "event", "obligation", "note", "habit", "contact", "transaction", "listItem"];

export const KIND_LABELS: Record<ImportKind, { one: string; many: string }> = {
  task: { one: tr("Tâche"), many: tr("Tâches") },
  event: { one: tr("Événement"), many: tr("Événements") },
  obligation: { one: tr("Obligation"), many: tr("Obligations") },
  note: { one: tr("Note"), many: tr("Notes") },
  habit: { one: tr("Habitude"), many: tr("Habitudes") },
  contact: { one: tr("Contact"), many: tr("Contacts") },
  transaction: { one: tr("Opération"), many: tr("Opérations") },
  listItem: { one: tr("Élément de liste"), many: tr("Éléments de listes") },
};

/** Nombre d'éléments : « 1 tâche », « 3 événements », « 2 éléments de listes ». */
export function countLabel(kind: ImportKind, n: number): string {
  const label = n > 1 ? KIND_LABELS[kind].many : KIND_LABELS[kind].one;
  return `${n} ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

export type FieldId =
  | "title"
  | "due"
  | "time"
  | "priority"
  | "tags"
  | "space"
  | "estimate"
  | "reminder"
  | "repeat"
  | "subtasks"
  | "notes"
  | "moment"
  | "date"
  | "start"
  | "end"
  | "endDate"
  | "location"
  | "category"
  | "amount"
  | "period"
  | "cancelBy"
  | "organization"
  | "reference"
  | "text"
  | "notebook"
  | "pinned"
  | "frequency"
  | "target"
  | "unit"
  | "negative"
  | "firstName"
  | "lastName"
  | "company"
  | "phone"
  | "email"
  | "address"
  | "birthday"
  | "debit"
  | "credit"
  | "direction"
  | "list"
  | "section"
  | "done"
  | "autoPay"
  | "keepInTouch"
  | "id";

export interface Column {
  field: FieldId;
  /** Noms acceptés ; le premier est celui des modèles. */
  names: readonly string[];
}

const TITLE = ["Titre", "Nom", "Intitulé", "Libellé", "Objet", "Sujet", "Title", "Name", "Subject"];
const NOTES = ["Notes", "Note", "Description", "Commentaire", "Commentaires", "Détails", "Remarques", "Comment", "Comments", "Details", "Remarks"];
const SPACE: Column = { field: "space", names: ["Espace", "Space", "Workspace"] };
const TAGS: Column = { field: "tags", names: ["Étiquettes", "Étiquette", "Tags", "Mots-clés", "Tag", "Labels", "Keywords"] };
const REMINDER: Column = { field: "reminder", names: ["Rappel", "Reminder", "Alert"] };
const REPEAT: Column = { field: "repeat", names: ["Répétition", "Récurrence", "Fréquence", "Repeat", "Recurrence", "Frequency"] };

export const COLUMNS: Record<ImportKind, readonly Column[]> = {
  task: [
    { field: "title", names: [...TITLE, "Tâche", "Task"] },
    { field: "due", names: ["Échéance", "Date", "Date d'échéance", "Date limite", "Pour le", "Due", "Due date", "Deadline"] },
    { field: "time", names: ["Heure", "Horaire", "Time", "Due time"] },
    { field: "start", names: ["Commencer le", "À partir du", "À partir de", "Start on", "Start date", "Starts on"] },
    { field: "priority", names: ["Priorité", "Importance", "Priority"] },
    TAGS,
    SPACE,
    { field: "estimate", names: ["Durée", "Durée estimée", "Estimation", "Duration", "Estimate", "Estimated time"] },
    REMINDER,
    REPEAT,
    { field: "subtasks", names: ["Sous-tâches", "Étapes", "Subtasks", "Steps", "Checklist"] },
    { field: "notes", names: NOTES },
  ],
  event: [
    { field: "title", names: [...TITLE, "Événement", "Rendez-vous", "Event", "Appointment"] },
    { field: "date", names: ["Date", "Jour", "Date de début", "Le", "Day", "Start date"] },
    { field: "start", names: ["Début", "Heure de début", "Heure", "De", "Start", "Start time", "Time", "From"] },
    { field: "end", names: ["Fin", "Heure de fin", "À", "End", "End time", "To"] },
    { field: "endDate", names: ["Date de fin", "Jusqu'au", "Fin le", "End date", "Until", "Ends on"] },
    { field: "location", names: ["Lieu", "Adresse", "Endroit", "Location", "Place", "Address", "Where"] },
    SPACE,
    REMINDER,
    REPEAT,
    { field: "notes", names: NOTES },
  ],
  obligation: [
    { field: "title", names: [...TITLE, "Obligation", "Bill"] },
    { field: "category", names: ["Catégorie", "Category"] },
    { field: "due", names: ["Échéance", "Date", "Date d'échéance", "Prochaine échéance", "Due", "Due date", "Next due date"] },
    { field: "amount", names: ["Montant", "Prix", "Coût", "Somme", "Amount", "Price", "Cost"] },
    { field: "period", names: ["Périodicité", "Fréquence", "Période", "Répétition", "Récurrence", "Frequency", "Period", "Repeat", "Billing cycle"] },
    { field: "cancelBy", names: ["Préavis", "Résiliation", "Résilier avant", "Date limite de résiliation", "Cancel by", "Cancellation deadline", "Notice"] },
    { field: "organization", names: ["Organisme", "Fournisseur", "Société", "Entreprise", "Prestataire", "Organisation", "Organization", "Provider", "Supplier", "Company"] },
    { field: "reference", names: ["Référence", "Réf", "Numéro", "Numéro de contrat", "Reference", "Ref", "Number", "Contract number", "Account number"] },
    { field: "autoPay", names: ["Prélèvement", "Prélèvement automatique", "Prélevé", "Paiement automatique", "Direct debit", "Autopay", "Automatic payment"] },
    SPACE,
    { field: "notes", names: NOTES },
  ],
  note: [
    { field: "title", names: TITLE },
    { field: "text", names: ["Texte", "Contenu", "Corps", "Notes", "Note", "Text", "Content", "Body"] },
    { field: "notebook", names: ["Carnet", "Dossier", "Classeur", "Notebook", "Folder"] },
    TAGS,
    SPACE,
    { field: "pinned", names: ["Épinglée", "Épinglé", "Épingler", "Pinned", "Pin"] },
  ],
  habit: [
    { field: "title", names: ["Nom", ...TITLE.filter((t) => t !== "Nom"), "Habitude", "Habit"] },
    { field: "frequency", names: ["Fréquence", "Jours", "Répétition", "Récurrence", "Frequency", "Days", "Repeat"] },
    { field: "target", names: ["Objectif", "Quantité", "Cible", "Target", "Goal", "Quantity"] },
    { field: "unit", names: ["Unité", "Unit"] },
    { field: "reminder", names: ["Rappel", "Heure", "Heure du rappel", "Reminder", "Time", "Reminder time"] },
    { field: "negative", names: ["À arrêter", "Arrêter", "Mauvaise habitude", "To break", "Break", "Bad habit"] },
    { field: "moment", names: ["Moment", "Moment de la journée", "Time of day"] },
    SPACE,
  ],
  contact: [
    { field: "firstName", names: ["Prénom", "First name", "Given name", "Forename"] },
    { field: "lastName", names: ["Nom", "Nom de famille", "Last name", "Surname", "Family name", "Name"] },
    { field: "company", names: ["Société", "Entreprise", "Organisation", "Organisme", "Company", "Organization", "Employer"] },
    { field: "phone", names: ["Téléphone", "Tél", "Tel", "Portable", "Mobile", "Téléphones", "Phone", "Telephone", "Phone number", "Phones", "Cell"] },
    { field: "email", names: ["E-mail", "Email", "Courriel", "Mail", "Adresse e-mail", "E-mails", "Email address", "Emails"] },
    { field: "address", names: ["Adresse", "Adresse postale", "Address", "Postal address", "Home address"] },
    { field: "birthday", names: ["Anniversaire", "Date de naissance", "Naissance", "Birthday", "Date of birth", "Birth date", "DOB"] },
    TAGS,
    { field: "keepInTouch", names: ["Rester en contact", "Fréquence de contact", "Suivi", "Keep in touch", "Contact frequency", "Follow-up"] },
    SPACE,
    { field: "notes", names: NOTES },
  ],
  transaction: [
    { field: "date", names: ["Date", "Jour", "Date d'opération", "Date de l'opération", "Date opération", "Date de valeur", "Le", "Day", "Transaction date", "Value date"] },
    { field: "title", names: ["Libellé", "Titre", "Opération", "Intitulé", "Objet", "Description", "Nom", "Title", "Transaction", "Name", "Payee"] },
    { field: "amount", names: ["Montant", "Somme", "Prix", "Montant en euros", "Amount", "Sum", "Value"] },
    { field: "category", names: ["Catégorie", "Rubrique", "Poste", "Category"] },
    { field: "direction", names: ["Sens", "Dépense ou revenu", "Mouvement", "Direction", "Expense or income"] },
    { field: "debit", names: ["Débit", "Débit euros", "Débits", "Dépense", "Sortie", "Debit", "Debits", "Expense", "Paid out", "Money out"] },
    { field: "credit", names: ["Crédit", "Crédit euros", "Crédits", "Revenu", "Entrée", "Credit", "Credits", "Income", "Paid in", "Money in"] },
    { field: "period", names: ["Répétition", "Récurrence", "Périodicité", "Fréquence", "Repeat", "Recurrence", "Frequency"] },
    { field: "endDate", names: ["Jusqu'au", "Fin de la répétition", "Date de fin", "Until", "End of repeat", "End date"] },
    SPACE,
    { field: "notes", names: [...NOTES.filter((n) => n !== "Description"), "Remarque"] },
  ],
  listItem: [
    { field: "list", names: ["Liste", "Nom de la liste", "List", "List name"] },
    { field: "title", names: ["Élément", "Titre", "Nom", "Article", "Intitulé", "Libellé", "Item", "Title", "Name"] },
    { field: "section", names: ["Rayon", "Section", "Groupe", "Aisle", "Group"] },
    { field: "done", names: ["Fait", "Coché", "Acheté", "Terminé", "Done", "Ticked", "Bought", "Completed", "Checked"] },
  ],
};

/** Colonnes d'un élément de liste qui deviennent des colonnes de la liste (« Auteur », « Prix »). */
export const keepsOtherColumns = (kind: ImportKind | "mixed") => kind === "listItem";

/** Valeur de la colonne « Type » qui désigne un revenu (opération du budget). */
export const isIncomeWord = (text: string) => /^(?:revenus?|income)$/.test(headerKey(text));

/** Colonne qui donne le type de chaque ligne. */
const TYPE_NAMES = ["type", "genre", "nature", "kind"];

const headerKey = (text: string) =>
  key(text)
    .replace(/[^a-z0-9']+/g, " ")
    .trim();

/**
 * Identifiant d'un élément d'Aqueli, écrit par les exports (tâches, contacts, opérations du
 * budget en .csv) : à la réimportation, la ligne met à jour l'élément au lieu d'en créer un.
 * Facultative, elle ne figure pas dans les modèles.
 */
export const ID_COLUMN: Column = { field: "id", names: ["Identifiant", "Identifiant Aqueli", "ID", "Aqueli ID"] };

/** Types dont les éléments se mettent à jour par leur identifiant. */
export const UPDATABLE_KINDS: readonly ImportKind[] = ["task", "event", "contact", "transaction"];

/** Colonnes reconnues pour ce type (celles des modèles, puis l'identifiant s'il s'applique). */
export const columnsOf = (kind: ImportKind): readonly Column[] => (UPDATABLE_KINDS.includes(kind) ? [...COLUMNS[kind], ID_COLUMN] : COLUMNS[kind]);

/** Champ d'un nom de colonne pour ce type, ou `null` ; `primary` : nom des modèles seulement. */
export function fieldOf(kind: ImportKind, name: string, primary = false): FieldId | null {
  const k = headerKey(name);
  if (!k) return null;
  const names = (c: Column) => (primary ? c.names.slice(0, 1) : c.names);
  return columnsOf(kind).find((c) => names(c).some((n) => headerKey(n) === k))?.field ?? null;
}

export function isTypeColumn(name: string): boolean {
  return TYPE_NAMES.includes(headerKey(name));
}

export interface HeaderMap {
  /** Champ de chaque colonne (`null` : ignorée). */
  fields: (FieldId | null)[];
  /** Colonnes ignorées, telles qu'écrites. */
  ignored: string[];
}

/**
 * Colonnes reconnues pour un type. Deux colonnes pour le même champ (« Date » et « Échéance ») :
 * le nom des modèles l'emporte, sinon la première ; l'autre est ignorée.
 */
export function mapHeaders(headers: readonly string[], kind: ImportKind): HeaderMap {
  const fields: (FieldId | null)[] = headers.map(() => null);
  const taken = new Set<FieldId>();
  for (const primary of [true, false]) {
    headers.forEach((h, i) => {
      if (fields[i] || !h.trim() || isTypeColumn(h)) return;
      const field = fieldOf(kind, h, primary);
      if (field && !taken.has(field)) {
        fields[i] = field;
        taken.add(field);
      }
    });
  }
  const ignored = headers.filter((h, i) => h.trim() && !isTypeColumn(h) && fields[i] === null).map((h) => h.trim());
  return { fields, ignored };
}

/** Types à venir : signalés, puis ignorés. */
const LATER: [RegExp, string][] = [];

export type KindGuess = { kind: ImportKind } | { later: string } | null;

/**
 * Type désigné par un nom d'onglet ou de fichier. `sheet` : nom d'onglet ; « liste » et les
 * types à venir ne sont pas reconnus dans un nom de fichier, où ces mots sont trop courants.
 */
export function kindFromWord(text: string, sheet = true): KindGuess {
  const k = headerKey(text);
  if (!k) return null;
  if (/tache|a faire|todo|\btasks?\b|to do/.test(k)) return { kind: "task" };
  if (/evenement|rendez|rdv|agenda|calendrier|\bevents?\b|appointment|calendar/.test(k)) return { kind: "event" };
  if (/obligation|echeancier|\bbills?\b/.test(k)) return { kind: "obligation" };
  if (/note/.test(k)) return { kind: "note" };
  if (/habitude|\bhabits?\b/.test(k)) return { kind: "habit" };
  if (/contact|repertoire|carnet d.adresses|address book/.test(k)) return { kind: "contact" };
  if (/depense|budget|operation|releve|revenu|expense|transaction|statement|income/.test(k)) return { kind: "transaction" };
  if (!sheet) return null;
  if (/liste|\blists?\b/.test(k)) return { kind: "listItem" };
  for (const [re, label] of LATER) if (re.test(k)) return { later: label };
  return null;
}

/** Valeur exacte de la colonne « Type » (ou premier mot d'une ligne de texte). */
export function kindFromTypeValue(text: string): KindGuess {
  const k = headerKey(text);
  const words: Record<string, ImportKind> = {
    tache: "task",
    taches: "task",
    t: "task",
    evenement: "event",
    evenements: "event",
    rdv: "event",
    "rendez vous": "event",
    e: "event",
    obligation: "obligation",
    obligations: "obligation",
    o: "obligation",
    note: "note",
    notes: "note",
    n: "note",
    habitude: "habit",
    habitudes: "habit",
    h: "habit",
    contact: "contact",
    contacts: "contact",
    depense: "transaction",
    depenses: "transaction",
    revenu: "transaction",
    revenus: "transaction",
    operation: "transaction",
    operations: "transaction",
    d: "transaction",
    liste: "listItem",
    listes: "listItem",
    element: "listItem",
    article: "listItem",
    // Anglais.
    task: "task",
    tasks: "task",
    event: "event",
    events: "event",
    appointment: "event",
    bill: "obligation",
    bills: "obligation",
    habit: "habit",
    habits: "habit",
    expense: "transaction",
    expenses: "transaction",
    income: "transaction",
    transaction: "transaction",
    transactions: "transaction",
    list: "listItem",
    lists: "listItem",
    item: "listItem",
    "list item": "listItem",
  };
  if (words[k]) return { kind: words[k] };
  return null;
}

/** Type deviné d'après les colonnes : celui dont le plus de colonnes sont propres à lui. */
export function kindFromHeaders(headers: readonly string[]): ImportKind {
  // Relevé de banque (« Date ; Libellé ; Montant ») : un montant daté, sans colonne propre aux obligations.
  const money = headers.map((h) => fieldOf("transaction", h));
  const obligation = headers.map((h) => fieldOf("obligation", h, true));
  if (
    money.includes("date") &&
    money.some((f) => f === "amount" || f === "debit" || f === "credit") &&
    !obligation.some((f) => f === "due" || f === "period" || f === "cancelBy" || f === "organization" || f === "reference")
  )
    return "transaction";
  let best: ImportKind = "task";
  let bestScore = 0;
  // Les opérations et les listes reprennent des noms courants (« Catégorie », « Nom ») : ils
  // restent propres aux autres types, qui les avaient avant eux.
  const recent: readonly ImportKind[] = ["transaction", "listItem"];
  for (const kind of KINDS) {
    const others = KINDS.filter((k) => k !== kind && (recent.includes(kind) || !recent.includes(k)));
    const score = headers.filter((h) => fieldOf(kind, h) !== null && others.every((o) => fieldOf(o, h) === null)).length;
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  }
  return best;
}
