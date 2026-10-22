import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { requestCalendar } from "../calendar/calendarRequest";
import { useEvents } from "../calendar/EventsProvider";
import { requestHabit } from "../habits/habitRequest";
import { useHabits } from "../habits/HabitsProvider";
import { useContactsIfAny } from "../contacts/ContactsProvider";
import { useDocumentsIfAny } from "../documents/DocumentsProvider";
import { useBudgetIfAny } from "../budget/BudgetProvider";
import { useGoalsIfAny } from "../goals/GoalsProvider";
import { contactRequest, documentRequest, goalRequest, listRequest, projectRequest, transactionRequest } from "../lib/request";
import { useListsIfAny } from "../lists/ListsProvider";
import { useProjectsIfAny } from "../projects/ProjectsProvider";
import { requestJournal } from "../journal/journalRequest";
import { useJournal } from "../journal/JournalProvider";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Select } from "../components/SelectRow";
import { getModule, type ModuleKey } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { requestNote } from "../notes/noteRequest";
import { useNotes } from "../notes/NotesProvider";
import { requestObligation } from "../obligations/obligationRequest";
import { useObligations } from "../obligations/ObligationsProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { formatShortDay } from "../tasks/day";
import { requestTaskOpen } from "../tasks/taskFocus";
import { useTasks } from "../tasks/TasksProvider";
import {
  buildDocs,
  DATE_FILTERS,
  groupResults,
  knownTags,
  SEARCH_KINDS,
  searchDocs,
  type DateFilter,
  type SearchDoc,
  type SearchKind,
} from "./searchIndex";
import { tr } from "../i18n/i18n";

const MODULE_OF: Record<SearchKind, ModuleKey> = {
  task: "taches",
  event: "calendrier",
  obligation: "obligations",
  note: "notes",
  project: "projets",
  contact: "contacts",
  document: "documents",
  journal: "journal",
  habit: "habitudes",
  list: "listes",
  goal: "objectifs",
  transaction: "budget",
};
const CLOSED: Record<SearchKind, string> = {
  task: tr("Terminée"),
  event: "",
  obligation: tr("Payée ou résiliée"),
  note: "",
  project: tr("Terminé ou archivé"),
  contact: "",
  document: "",
  journal: "",
  habit: tr("Archivée"),
  list: tr("Archivée ou cochée"),
  goal: tr("Atteint ou abandonné"),
  transaction: "",
};
/** Résultats par type quand tous les types sont affichés ; « N de plus » montre le reste. */
const PER_GROUP = 5;
/** Au plus, dans un seul type (la liste défile). */
const MAX_SHOWN = 200;

interface GlobalSearchProps {
  initialQuery?: string;
  onClose: () => void;
}

/** Recherche globale (Ctrl+Maj+F) : tous les modules à la fois, résultats groupés par type. */
export function GlobalSearch({ initialQuery = "", onClose }: GlobalSearchProps) {
  const { tasks, today } = useTasks();
  const { events } = useEvents();
  const { obligations } = useObligations();
  const { notes, search: searchNotes } = useNotes();
  const { pages, search: searchJournal } = useJournal();
  const { habits } = useHabits();
  const projects = useProjectsIfAny()?.projects;
  const contacts = useContactsIfAny()?.contacts;
  const documents = useDocumentsIfAny()?.documents;
  const listsData = useListsIfAny();
  const goals = useGoalsIfAny()?.goals;
  const budget = useBudgetIfAny();
  const { filter: space } = useSpaces();
  const { go } = useNavigation();
  const [query, setQuery] = useState(initialQuery);
  const [settled, setSettled] = useState(initialQuery);
  const [kind, setKind] = useState<SearchKind | "tout">("tout");
  const [date, setDate] = useState<DateFilter>("toutes");
  const [tag, setTag] = useState("");
  const [noteIds, setNoteIds] = useState<string[]>([]);
  const [journalDays, setJournalDays] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const journal = useMemo(() => [...pages.values()], [pages]);
  const docs = useMemo(
    () =>
      buildDocs({
        tasks,
        events,
        obligations,
        notes,
        journal,
        habits,
        projects,
        contacts,
        documents,
        lists: listsData?.lists,
        listItems: listsData?.items,
        goals,
        transactions: budget?.transactions,
        budgetCategories: budget?.categories,
      }),
    [tasks, events, obligations, notes, journal, habits, projects, contacts, documents, listsData?.lists, listsData?.items, goals, budget?.transactions, budget?.categories],
  );
  const tags = useMemo(() => knownTags(docs), [docs]);

  // Un instant après la dernière frappe.
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(query), 100);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Le texte complet des notes et du journal est cherché par le cœur (index plein texte).
  const searchRef = useRef({ notes: searchNotes, journal: searchJournal });
  searchRef.current = { notes: searchNotes, journal: searchJournal };
  useEffect(() => {
    if (!settled.trim()) {
      setNoteIds([]);
      setJournalDays([]);
      return;
    }
    let alive = true;
    searchRef.current
      .notes(settled)
      .then((ids) => alive && setNoteIds(ids))
      .catch(() => alive && setNoteIds([]));
    searchRef.current
      .journal(settled)
      .then((days) => alive && setJournalDays(days))
      .catch(() => alive && setJournalDays([]));
    return () => {
      alive = false;
    };
  }, [settled]);

  const all = useMemo(
    () => searchDocs(docs, settled, { kind: "tout", date, tag: tag || null, space }, today, noteIds, journalDays),
    [docs, settled, date, tag, space, today, noteIds, journalDays],
  );
  const groups = groupResults(kind === "tout" ? all : all.filter((r) => r.doc.kind === kind));
  const count = (k: SearchKind) => all.filter((r) => r.doc.kind === k).length;
  const shown = groups.map((g) => ({ ...g, list: g.results.slice(0, kind === "tout" ? PER_GROUP : MAX_SHOWN) }));
  const flat = shown.flatMap((g) => g.list);
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1));

  // Le focus revient là où il était à la fermeture.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const open = (doc: SearchDoc | undefined) => {
    if (!doc) return;
    onClose();
    if (doc.kind === "task") {
      go("taches");
      requestTaskOpen(doc.id);
    } else if (doc.kind === "event") {
      go("calendrier");
      requestCalendar({ day: doc.day ?? today, eventId: doc.id });
    } else if (doc.kind === "obligation") {
      go("obligations");
      requestObligation({ id: doc.id });
    } else if (doc.kind === "journal") {
      go("journal");
      requestJournal(doc.id);
    } else if (doc.kind === "habit") {
      go("habitudes");
      requestHabit(doc.id);
    } else if (doc.kind === "project") {
      go("projets");
      projectRequest.request(doc.id);
    } else if (doc.kind === "contact") {
      go("contacts");
      contactRequest.request(doc.id);
    } else if (doc.kind === "document") {
      go("documents");
      documentRequest.request(doc.id);
    } else if (doc.kind === "list") {
      go("listes");
      listRequest.request(doc.id.split("/")[0]!);
    } else if (doc.kind === "goal") {
      go("objectifs");
      goalRequest.request(doc.id);
    } else if (doc.kind === "transaction") {
      go("budget");
      transactionRequest.request(doc.id);
    } else {
      go("notes");
      requestNote({ id: doc.id });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(flat.length ? (activeIndex + step + flat.length) % flat.length : 0);
    } else if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      open(flat[activeIndex]?.doc);
    }
  };

  const optionId = (i: number) => `${baseId}-resultat-${i}`;
  let index = -1;

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette gsearch glass-popover" role="dialog" aria-modal="true" aria-label={tr("Recherche globale")} onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Icon d={ICONS.search} size={18} stroke={2.2} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${baseId}-liste`}
            aria-activedescendant={flat.length ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            placeholder={tr("Rechercher dans les tâches, rendez-vous, obligations et notes")}
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <kbd className="kbd">{tr("Échap")}</kbd>
        </div>

        <div className="gsearch-filters">
          <div className="gsearch-kinds" role="group" aria-label={tr("Type")}>
            <button type="button" className="pill pill--button gsearch-kind" aria-pressed={kind === "tout"} onClick={() => setKind("tout")}>
              {tr("Tout")}{settled.trim() ? ` · ${all.length}` : ""}
            </button>
            {SEARCH_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className="pill pill--button gsearch-kind"
                aria-pressed={kind === k.id}
                data-empty={(settled.trim() !== "" && count(k.id) === 0) || undefined}
                onClick={() => {
                  setKind(k.id);
                  setActive(0);
                }}
              >
                {k.label}
                {settled.trim() ? ` · ${count(k.id)}` : ""}
              </button>
            ))}
          </div>
          <div className="gsearch-selects">
            <Select value={date} options={DATE_FILTERS} onChange={setDate} label={tr("Date")} />
            <Select
              value={tag}
              options={[{ value: "", label: tr("Toutes les étiquettes") }, ...tags.map((t) => ({ value: t, label: `#${t}` }))]}
              onChange={setTag}
              label={tr("Étiquette")}
            />
          </div>
        </div>

        <div ref={listRef} id={`${baseId}-liste`} role="listbox" aria-label={tr("Résultats")} className="gsearch-results">
          {shown.map((g) => {
            const m = getModule(MODULE_OF[g.kind]);
            return (
              <div key={g.kind} role="group" aria-label={g.label} className="gsearch-group">
                <div className="gsearch-group-title" aria-hidden="true">
                  {g.label} · {g.results.length}
                </div>
                {g.list.map((r) => {
                  index += 1;
                  const i = index;
                  const when = r.doc.day ? formatShortDay(r.doc.day, today) : null;
                  const detail = [when, r.doc.closed ? CLOSED[r.doc.kind] : "", r.doc.detail].filter(Boolean).join(" · ");
                  return (
                    <div
                      key={`${r.doc.kind}:${r.doc.id}`}
                      id={optionId(i)}
                      data-index={i}
                      role="option"
                      aria-selected={i === activeIndex}
                      className="palette-item gsearch-item"
                      data-closed={r.doc.closed || undefined}
                      onPointerMove={() => i !== activeIndex && setActive(i)}
                      onClick={() => open(r.doc)}
                    >
                      <ModuleChip color={m.color} icon={m.icon} size={26} />
                      <span className="gsearch-text">
                        <span className="palette-label">{r.doc.title}</span>
                        {detail && <span className="gsearch-detail">{detail}</span>}
                      </span>
                    </div>
                  );
                })}
                {kind === "tout" && g.results.length > PER_GROUP && (
                  <button
                    type="button"
                    className="link-btn gsearch-more"
                    onClick={() => {
                      setKind(g.kind);
                      setActive(0);
                    }}
                  >
                    {tr("{n} de plus", { n: g.results.length - PER_GROUP })}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!settled.trim() ? (
          <p className="palette-empty">{tr("Saisir un mot. Les accents et une faute de frappe sont tolérés.")}</p>
        ) : (
          flat.length === 0 && <p className="palette-empty">{tr("Aucun résultat pour « {query} ».", { query: settled.trim() })}</p>
        )}

        <div className="palette-footer">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd>{tr(" Naviguer")}
          </span>
          <span>
            <kbd className="kbd">{tr("Entrée")}</kbd>{tr(" Ouvrir")}
          </span>
          <span>
            <kbd className="kbd">{tr("Échap")}</kbd>{tr(" Fermer")}
          </span>
        </div>
      </div>
    </div>
  );
}
