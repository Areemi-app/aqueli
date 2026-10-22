/**
 * Index des éléments qui se relient : titre, détail, module et ouverture de chacun, d'après
 * les données chargées. Sert aux sections « Liens » et au choix d'un élément à lier.
 */
import { useMemo } from "react";
import { requestCalendar } from "../calendar/calendarRequest";
import { useEvents } from "../calendar/EventsProvider";
import { contactName } from "../contacts/contacts";
import { useContactsIfAny } from "../contacts/ContactsProvider";
import { documentDetail } from "../documents/documents";
import { useDocumentsIfAny } from "../documents/DocumentsProvider";
import { contactRequest, documentRequest, goalRequest, projectRequest } from "../lib/request";
import { periodLabel } from "../goals/goals";
import { useGoalsIfAny } from "../goals/GoalsProvider";
import { getModule, type ModuleKey } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { requestNote } from "../notes/noteRequest";
import { useNotes } from "../notes/NotesProvider";
import { dueLabel } from "../obligations/obligations";
import { requestObligation } from "../obligations/obligationRequest";
import { useObligations } from "../obligations/ObligationsProvider";
import { STATUS_LABELS } from "../projects/projects";
import { useProjectsIfAny } from "../projects/ProjectsProvider";
import { formatShortDay } from "../tasks/day";
import { requestTaskOpen } from "../tasks/taskFocus";
import { useTasks } from "../tasks/TasksProvider";
import type { ItemRef, LinkKind } from "./links";
import { tr } from "../i18n/i18n";

export interface IndexedItem {
  ref: ItemRef;
  title: string;
  detail: string;
  module: ModuleKey;
  /** Couleur propre à l'élément ; sinon celle du module. */
  color: string | null;
  /** Tâche terminée, projet archivé… */
  closed: boolean;
}

export const KIND_MODULE: Record<LinkKind, ModuleKey> = {
  task: "taches",
  event: "calendrier",
  obligation: "obligations",
  note: "notes",
  project: "projets",
  contact: "contacts",
  document: "documents",
  goal: "objectifs",
};

export const KIND_LABELS: Record<LinkKind, { one: string; many: string }> = {
  task: { one: tr("Tâche"), many: tr("Tâches") },
  event: { one: tr("Événement"), many: tr("Événements") },
  obligation: { one: tr("Obligation"), many: tr("Obligations") },
  note: { one: tr("Note"), many: tr("Notes") },
  project: { one: tr("Projet"), many: tr("Projets") },
  contact: { one: tr("Contact"), many: tr("Contacts") },
  document: { one: tr("Document"), many: tr("Documents") },
  goal: { one: tr("Objectif"), many: tr("Objectifs") },
};

const keyOf = (ref: ItemRef) => `${ref.kind}:${ref.id}`;

export interface ItemIndex {
  items: readonly IndexedItem[];
  get: (ref: ItemRef) => IndexedItem | null;
  open: (ref: ItemRef) => void;
}

export function useItemIndex(): ItemIndex {
  const { tasks, today } = useTasks();
  const { events } = useEvents();
  const { obligations } = useObligations();
  const { notes } = useNotes();
  const projects = useProjectsIfAny()?.projects;
  const contacts = useContactsIfAny()?.contacts;
  const documents = useDocumentsIfAny()?.documents;
  const goals = useGoalsIfAny()?.goals;
  const { go } = useNavigation();

  const items = useMemo(() => {
    const list: IndexedItem[] = [];
    const add = (kind: LinkKind, id: string, title: string, detail: string, color: string | null, closed = false) =>
      list.push({ ref: { kind, id }, title, detail, module: KIND_MODULE[kind], color, closed });
    for (const t of tasks) add("task", t.id, t.title, t.dueDate ? formatShortDay(t.dueDate, today) : "", t.color, t.doneAt !== null);
    for (const e of events) add("event", e.id, e.title, formatShortDay(e.startDate, today) + (e.startTime ? ` · ${e.startTime}` : ""), e.color);
    for (const o of obligations) add("obligation", o.id, o.title, dueLabel(o.dueDate, today), o.color, o.status !== "a-faire");
    for (const n of notes) add("note", n.id, n.title.trim() || tr("Sans titre"), n.excerpt, n.color, n.archived);
    for (const p of projects ?? []) add("project", p.id, p.name, STATUS_LABELS[p.status], p.color, p.archived);
    for (const c of contacts ?? []) add("contact", c.id, contactName(c), c.company && contactName(c) !== c.company ? c.company : "", c.color);
    for (const d of documents ?? []) add("document", d.id, d.name, documentDetail(d), null);
    for (const g of goals ?? []) add("goal", g.id, g.title, periodLabel(g), g.color, g.status !== "en-cours");
    return list;
  }, [tasks, events, obligations, notes, projects, contacts, documents, goals, today]);

  return useMemo(() => {
    const byKey = new Map(items.map((i) => [keyOf(i.ref), i]));
    const open = (ref: ItemRef) => {
      switch (ref.kind) {
        case "task":
          go("taches");
          requestTaskOpen(ref.id);
          break;
        case "event": {
          const e = events.find((x) => x.id === ref.id);
          go("calendrier");
          requestCalendar({ day: e?.startDate, eventId: ref.id });
          break;
        }
        case "obligation":
          go("obligations");
          requestObligation({ id: ref.id });
          break;
        case "note":
          go("notes");
          requestNote({ id: ref.id });
          break;
        case "project":
          go("projets");
          projectRequest.request(ref.id);
          break;
        case "contact":
          go("contacts");
          contactRequest.request(ref.id);
          break;
        case "document":
          go("documents");
          documentRequest.request(ref.id);
          break;
        case "goal":
          go("objectifs");
          goalRequest.request(ref.id);
          break;
      }
    };
    return { items, get: (ref) => byKey.get(keyOf(ref)) ?? null, open };
  }, [items, events, go]);
}

/** Couleur affichée d'un élément de l'index. */
export const itemColor = (item: Pick<IndexedItem, "color" | "module">) => item.color ?? getModule(item.module).color;
