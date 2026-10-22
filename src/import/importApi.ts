/** Import de fichiers (src-tauri/src/import.rs). */
import { invoke } from "@tauri-apps/api/core";
import { eventsApi } from "../calendar/api";
import { asDataError, dataErrorMessage, type DataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { budgetApi } from "../budget/api";
import { contactsApi } from "../contacts/api";
import { listsApi } from "../lists/api";
import { habitsApi } from "../habits/api";
import { notesApi } from "../notes/api";
import { obligationsApi } from "../obligations/api";
import { tasksApi } from "../tasks/api";
import type { DayKey } from "../tasks/day";
import type { ImportKind } from "./fields";
import type { Batch, Updates } from "./records";
import { tr } from "../i18n/i18n";

export interface ImportFile {
  path: string;
  name: string;
  size: number;
  /** Dernière modification, en secondes Unix. */
  modified: number;
  /** Dans le dossier d'import : supprimé ou rangé après l'import. */
  inFolder: boolean;
}

/** Dossier d'import, guide d'import, modèles et exemples. */
export type ImportPlace = "dossier" | "guide" | "modeles";

export interface ImportStatus {
  folder: string;
  guide: string;
  files: ImportFile[];
}

/** Identifiants des éléments créés, pour annuler l'import. */
export interface Created {
  tasks: string[];
  events: string[];
  obligations: string[];
  notes: string[];
  habits: string[];
  contacts: string[];
  transactions: string[];
  /** Listes créées par l'import (avec leurs éléments). */
  lists: string[];
  /** Éléments ajoutés à des listes existantes. */
  listItems: string[];
}

export type ImportError =
  | { code: "locked" }
  | { code: "notFound" }
  | { code: "tooLarge"; max: number }
  | { code: "unavailable" }
  | { code: "io" };

/** Élément refusé par la base : type et place dans la liste envoyée. */
export interface ImportFailure {
  kind: ImportKind | null;
  index: number | null;
  error: DataError;
}

export function importErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
  switch (code) {
    case "locked":
      return tr("Aqueli est verrouillé.");
    case "notFound":
      return tr("Fichier introuvable.");
    case "tooLarge":
      return tr("Fichier trop volumineux (10 Mo au plus).");
    case "unavailable":
      return tr("Dossier Documents introuvable.");
    default:
      return tr("Lecture ou écriture du fichier impossible.");
  }
}

export function failureMessage(failure: unknown): string {
  if (typeof failure === "object" && failure !== null && "error" in failure) return dataErrorMessage(asDataError((failure as ImportFailure).error));
  return dataErrorMessage(asDataError(failure));
}

export interface ImportApi {
  status(): Promise<ImportStatus>;
  /** Fichier choisi, ou `null` si la fenêtre a été fermée. */
  pickFile(): Promise<ImportFile | null>;
  /** Fichier glissé sur la fenêtre. */
  describe(path: string): Promise<ImportFile>;
  read(path: string): Promise<Uint8Array>;
  apply(batch: Batch, today: DayKey): Promise<Created>;
  /** Annule un import : les éléments créés vont à la corbeille, les éléments mis à jour retrouvent `restore`. */
  undo(created: Created, restore: Updates | null, today: DayKey): Promise<void>;
  /** Supprime le fichier du dossier d'import (`keep` : le range dans ImportTraités). */
  finish(path: string, keep: boolean): Promise<void>;
  /** Ouvre le dossier d'import, le guide (dans le navigateur) ou le dossier des modèles. */
  open(target: ImportPlace): Promise<void>;
}

const EXAMPLE = demo(
  `TÂCHE | Appeler le garage | 03/10/2026 14:00 | #voiture | !haute | espace: Perso
TÂCHE | Préparer les cartons | 10/10/2026 | #déménagement | durée: 2 h | sous-tâches: Cuisine; Salon; Chambre
TÂCHE | Arroser les plantes | chaque semaine | espace: Maison
TÂCHE | | 12/10/2026
ÉVÉNEMENT | Dentiste | 08/10/2026 09:30-10:00 | lieu: Cabinet Martin | rappel: 1 h | espace: Santé
ÉVÉNEMENT | Réunion | 12/10/2026 14:00-13:00
OBLIGATION | Assurance habitation | Assurances | échéance 15/11/2026 | préavis 15/10/2026 | 312 € | annuelle
OBLIGATION | Abonnement téléphone | Abonnements | échéance 05/10/2026 | 19,99 € | mensuelle
NOTE | Idées cadeaux | Livre de cuisine, écharpe, jeu de société
DÉPENSE | 42,50 € | Courses | 27/09/2026
REVENU | Salaire | 2 450 € | 01/10/2026
LISTE | Lait | Courses | Frais
`,
  `TASK | Call the garage | 03/10/2026 14:00 | #car | !high | space: Personal
TASK | Pack the boxes | 10/10/2026 | #moving | duration: 2 h | subtasks: Kitchen; Living room; Bedroom
TASK | Water the plants | every week | space: Home
TASK | | 12/10/2026
EVENT | Dentist | 08/10/2026 09:30-10:00 | location: Martin surgery | reminder: 1 h | space: Health
EVENT | Meeting | 12/10/2026 14:00-13:00
OBLIGATION | Home insurance | Insurance | due 15/11/2026 | cancel by 15/10/2026 | €312 | yearly
OBLIGATION | Phone plan | Subscriptions | due 05/10/2026 | €19.99 | monthly
NOTE | Gift ideas | Cookbook, scarf, board game
EXPENSE | €42.50 | Groceries | 27/09/2026
INCOME | Salary | €2,450 | 01/10/2026
LIST | Milk | Shopping | Fresh
`,
);

const CSV = demo(
  `Titre;Échéance;Heure;Priorité;Étiquettes;Espace
Réserver le camion;10/10/2026;9h;haute;déménagement;Perso
Résilier la box;31/10/2026;;moyenne;;Perso
Réserver le camion;10/10/2026;;;;
Prévenir la banque;;;;;
Envoyer le préavis;32/10/2026;;;;
`,
  `Title;Due date;Time;Priority;Tags;Space
Book the removal van;10/10/2026;09:00;high;moving;Personal
Cancel the broadband;31/10/2026;;medium;;Personal
Book the removal van;10/10/2026;;;;
Tell the bank;;;;;
Send the notice;32/10/2026;;;;
`,
);

/** Mises à jour de l'aperçu, une à une. */
async function applyUpdates(updates: Updates | undefined, today: DayKey): Promise<void> {
  for (const r of updates?.tasks ?? []) await tasksApi.update(r.id, r.input, today);
  for (const r of updates?.events ?? []) await eventsApi.update(r.id, r.input);
  for (const r of updates?.contacts ?? []) await contactsApi.update(r.id, r.input);
  for (const r of updates?.transactions ?? []) await budgetApi.update(r.id, r.input);
}

/** Aperçu dans un navigateur (développement) : un fichier d'exemple dans le dossier d'import. */
function previewApi(): ImportApi {
  const folder = "C:\\Users\\…\\Documents\\Aqueli\\Import";
  let files: ImportFile[] = [{ path: `${folder}\\${demo("Exemple.txt", "Example.txt")}`, name: demo("Exemple.txt", "Example.txt"), size: EXAMPLE.length, modified: Math.floor(Date.now() / 1000) - 60, inFolder: true }];
  const picked: ImportFile = { path: demo("C:\\Users\\…\\Bureau\\tâches.csv", "C:\\Users\\…\\Desktop\\tasks.csv"), name: tr("tâches.csv"), size: CSV.length, modified: 0, inFolder: false };
  return {
    status: async (): Promise<ImportStatus> => ({ folder, guide: tr("C:\\Users\\…\\Documents\\Aqueli\\Guide d'import"), files }),
    pickFile: async (): Promise<ImportFile | null> => picked,
    describe: async (path: string): Promise<ImportFile> => files.find((f) => f.path === path) ?? picked,
    read: async (path: string): Promise<Uint8Array> => new TextEncoder().encode(path.endsWith(".csv") ? CSV : EXAMPLE),
    apply: async (batch: Batch, today: DayKey): Promise<Created> => {
      // Mises à jour : appliquées avant le reste (l'aperçu n'a pas de transaction).
      await applyUpdates(batch.updates, today);
      return {
      tasks: await Promise.all(batch.tasks.map(async (t) => (await tasksApi.create(t, today)).id)),
      events: await Promise.all(batch.events.map(async (e) => (await eventsApi.create(e)).id)),
      obligations: await Promise.all(batch.obligations.map(async (o) => (await obligationsApi.create(o)).id)),
      notes: await Promise.all(batch.notes.map(async (n) => (await notesApi.create(n.body, n.meta)).id)),
      habits: await Promise.all(batch.habits.map(async (h) => (await habitsApi.create(h)).id)),
      contacts: await Promise.all(batch.contacts.map(async (c) => (await contactsApi.create(c)).id)),
      transactions: await Promise.all(batch.transactions.map(async (t) => (await budgetApi.create(t)).id)),
      ...(await (async () => {
        const lists: string[] = [];
        const listItems: string[] = [];
        for (const group of batch.lists) {
          let listId = group.listId;
          if (!listId && group.list) {
            listId = (await listsApi.create(group.list)).id;
            lists.push(listId);
          }
          for (const item of group.items) {
            const created = await listsApi.createItem(listId!, item);
            if (group.listId) listItems.push(created.id);
          }
        }
        return { lists, listItems };
      })()),
      };
    },
    undo: async (created: Created, restore: Updates | null, today: DayKey): Promise<void> => {
      if (restore) await applyUpdates(restore, today);
      await Promise.all([
        ...created.tasks.map((id) => tasksApi.remove(id)),
        ...created.events.map((id) => eventsApi.remove(id)),
        ...created.obligations.map((id) => obligationsApi.remove(id)),
        ...created.notes.map((id) => notesApi.remove(id)),
        ...(created.habits ?? []).map((id) => habitsApi.remove(id)),
        ...(created.contacts ?? []).map((id) => contactsApi.remove(id)),
        ...(created.transactions ?? []).map((id) => budgetApi.remove(id)),
        ...(created.lists ?? []).map((id) => listsApi.remove(id)),
        ...(created.listItems ?? []).map((id) => listsApi.removeItem(id)),
      ]);
    },
    finish: async (path: string): Promise<void> => {
      files = files.filter((f) => f.path !== path);
    },
    open: async (): Promise<void> => {},
  };
}

const tauriApi: ImportApi = {
  status: () => invoke<ImportStatus>("import_status"),
  pickFile: () => invoke<ImportFile | null>("import_pick_file"),
  describe: (path) => invoke<ImportFile>("import_describe", { path }),
  read: async (path) => new Uint8Array(await invoke<ArrayBuffer>("import_read", { path })),
  apply: (batch, today) => invoke<Created>("import_apply", { batch, today }),
  undo: (created, restore, today) => invoke<void>("import_undo", { created, restore, today }),
  finish: (path, keep) => invoke<void>("import_finish", { path, keep }),
  open: (target) => invoke<void>("import_open", { target }),
};

export const importApi: ImportApi = inTauri || !import.meta.env.DEV ? tauriApi : previewApi();
