import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useNow } from "../lib/useNow";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays, formatShortDay, type DayKey } from "./day";
import { parseQuickAdd } from "./quickAdd";
import { useContactLabel, useContactRefs, useLinkContacts } from "../contacts/contactRefs";
import { getModule } from "../modules/modules";
import { recurrenceLabel } from "./recurrence";
import { readDefaultReminder } from "./reminderPrefs";
import { defaultReminderFor } from "./reminders";
import { PRIORITY_LABELS, type SmartListId, type Task, type TaskInput } from "./tasks";
import { useTasks } from "./TasksProvider";
import { tr } from "../i18n/i18n";

/** Échéance proposée quand la saisie n'en donne pas, selon la liste affichée. */
function defaultDate(list: SmartListId, today: DayKey): DayKey | null {
  if (list === "aujourdhui" || list === "en-retard") return today;
  if (list === "a-venir") return addDays(today, 1);
  return null;
}

interface QuickAddFieldProps {
  list: SmartListId;
  inputRef: RefObject<HTMLInputElement | null>;
  onAdded: (task: Task) => void;
  /** Change à chaque « Nouvelle tâche » : le champ s'éclaire et montre où écrire. */
  callout?: number;
}

/** Durée de la mise en avant du champ après « Nouvelle tâche ». */
const CALLOUT_MS = 4000;

/** Ajout rapide en langage naturel, avec aperçu de ce qui est reconnu (maquette Tâches). */
export function QuickAddField({ list, inputRef, onAdded, callout = 0 }: QuickAddFieldProps) {
  const { create, today } = useTasks();
  const { spaces, filter } = useSpaces();
  const now = useNow();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [called, setCalled] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!callout) return;
    setCalled(true);
    boxRef.current?.scrollIntoView({ block: "nearest" });
    const timer = window.setTimeout(() => setCalled(false), CALLOUT_MS);
    return () => window.clearTimeout(timer);
  }, [callout]);

  const contacts = useContactRefs();
  const linkContacts = useLinkContacts();
  const contactLabel = useContactLabel();
  const parsed = useMemo(() => parseQuickAdd(text, now, spaces, contacts), [text, now, spaces, contacts]);
  const listTag = list.startsWith("tag:") ? list.slice(4) : null;
  const tags = listTag && !parsed.tags.some((t) => t.toLowerCase() === listTag.toLowerCase()) ? [...parsed.tags, listTag] : parsed.tags;
  // Une tâche répétée sans date reçoit sa première échéance du cœur.
  const dueDate = parsed.dueDate ?? (parsed.recurrence ? null : defaultDate(list, today));
  const spaceId = parsed.spaceId ?? (filter !== "tous" ? filter : (spaces[0]?.id ?? null));
  const space = spaces.find((s) => s.id === spaceId);
  const hasText = text.trim().length > 0;

  const submit = async () => {
    if (!parsed.title || busy) return;
    const input: TaskInput = {
      title: parsed.title,
      notes: "",
      spaceId,
      dueDate,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      estimate: null,
      tags,
      subtasks: [],
      recurrence: parsed.recurrence,
      color: null,
      reminder: defaultReminderFor({ dueTime: null, reminder: null }, parsed.dueTime, readDefaultReminder()),
      inbox: !parsed.recurrence && (list === "boite" || (dueDate === null && list !== "sans-date" && !listTag)),
    };
    setBusy(true);
    setError(null);
    try {
      const task = await create(input);
      await linkContacts({ kind: "task", id: task.id }, parsed.contactIds);
      setText("");
      onAdded(task);
    } catch (err) {
      setError(dataErrorMessage(err as DataError));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div ref={boxRef} className="quick-add" data-error={error ? true : undefined} data-called={called && !hasText ? true : undefined}>
      <div className="quick-add-row">
        <Icon d={ICONS.plus} size={18} stroke={2.6} className="quick-add-plus" />
        <label htmlFor="ajout-rapide" className="sr-only">
          {tr("Ajouter une tâche")}
        </label>
        <input
          id="ajout-rapide"
          ref={inputRef}
          className="quick-add-input"
          value={text}
          placeholder={tr("Ajouter une tâche : « Appeler le garage vendredi 14h #voiture !haute »")}
          autoComplete="off"
          spellCheck
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape" && text) {
              e.preventDefault();
              setText("");
            }
          }}
        />
        {hasText && <span className="quick-add-hint">{parsed.title ? tr("Entrée pour ajouter") : tr("Saisissez un titre.")}</span>}
      </div>
      {called && !hasText && (
        <p className="quick-add-callout" role="status">
          {tr("Écrivez la tâche ici, puis appuyez sur Entrée.")}
        </p>
      )}
      {hasText && (
        <div className="quick-add-chips" aria-live="polite">
          {dueDate && (
            <span className="pill">
              {formatShortDay(dueDate, today)}
              {parsed.dueTime && ` · ${parsed.dueTime}`}
            </span>
          )}
          {parsed.recurrence && (
            <span className="pill pill--icon">
              <Icon d={ICONS.repeat} size={12} stroke={2.4} />
              {recurrenceLabel(parsed.recurrence)}
            </span>
          )}
          {tags.map((tag) => (
            <span key={tag} className="pill">
              #{tag}
            </span>
          ))}
          {parsed.priority > 0 && (
            <span className="pill pill--priority" data-priority={parsed.priority}>
              {tr("Priorité {level}", { level: PRIORITY_LABELS[parsed.priority].toLowerCase() })}
            </span>
          )}
          {parsed.contactIds.map((id) => (
            <span key={id} className="pill pill--icon">
              <Icon d={getModule("contacts").icon} size={12} stroke={2.4} />
              {contactLabel(id)}
            </span>
          ))}
          {space && <span className="pill">{tr("Espace {name}", { name: space.name })}</span>}
        </div>
      )}
      {error && (
        <p className="form-error quick-add-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
