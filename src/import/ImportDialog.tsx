import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { announceData, type DataKind } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { useEvents } from "../calendar/EventsProvider";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select, type SelectOption } from "../components/SelectRow";
import { getModule, type ModuleKey } from "../modules/modules";
import { useHabits } from "../habits/HabitsProvider";
import { useBudgetIfAny } from "../budget/BudgetProvider";
import { useContactsIfAny } from "../contacts/ContactsProvider";
import { useListsIfAny } from "../lists/ListsProvider";
import { useNotes } from "../notes/NotesProvider";
import { useObligations } from "../obligations/ObligationsProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { useTasks } from "../tasks/TasksProvider";
import { dayKey } from "../tasks/day";
import { readDefaultReminder } from "../tasks/reminderPrefs";
import { countLabel, KIND_LABELS, KINDS, type ImportKind } from "./fields";
import { failureMessage, importApi, importErrorMessage, type Created, type ImportFailure, type ImportFile } from "./importApi";
import type { TextMode } from "./lines";
import { toBatch, type ImportContext, type ImportRow } from "./records";
import { previewSources, readImportFile, type ImportFileContent, type SourceChoice, type SourcePreview } from "./sources";
import { ImportFileError } from "./xlsx";
import { prepareUpdates } from "./updates";
import { tr, trn } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

const MODULE_OF: Record<ImportKind, ModuleKey> = {
  task: "taches",
  event: "calendrier",
  obligation: "obligations",
  note: "notes",
  habit: "habitudes",
  contact: "contacts",
  transaction: "budget",
  listItem: "listes",
};

/** Listes à relire après l'import. */
const DATA_OF: Record<ImportKind, DataKind> = {
  task: "task",
  event: "event",
  obligation: "obligation",
  note: "note",
  habit: "habit",
  contact: "contact",
  transaction: "transaction",
  listItem: "list",
};

const kindStyle = (kind: ImportKind) => ({ "--row-color": getModule(MODULE_OF[kind]).color }) as CSSProperties;

const TABLE_CHOICES: SelectOption<ImportKind>[] = KINDS.map((k) => ({ value: k, label: KIND_LABELS[k].many }));
const MIXED: SelectOption<"mixed"> = { value: "mixed", label: tr("Selon la colonne « Type »") };
const TEXT_CHOICES: SelectOption<TextMode>[] = [
  { value: "tasks", label: tr("Une tâche par ligne") },
  { value: "events", label: tr("Un événement par ligne") },
  { value: "note", label: tr("Une seule note") },
];

/** « Tâche importée. », « 3 tâches importées. » */
const IMPORTED: Record<ImportKind, (n: number) => string> = {
  task: (n) => trn(n, "Tâche importée.", "{n} tâches importées."),
  event: (n) => trn(n, "Événement importé.", "{n} événements importés."),
  obligation: (n) => trn(n, "Obligation importée.", "{n} obligations importées."),
  note: (n) => trn(n, "Note importée.", "{n} notes importées."),
  habit: (n) => trn(n, "Habitude importée.", "{n} habitudes importées."),
  contact: (n) => trn(n, "Contact importé.", "{n} contacts importés."),
  transaction: (n) => trn(n, "Opération importée.", "{n} opérations importées."),
  listItem: (n) => trn(n, "Élément de liste importé.", "{n} éléments de listes importés."),
};

/** « 3 tâches importées. 2 éléments mis à jour. » */
export function importedAndUpdatedMessage(counts: Readonly<Record<ImportKind, number>>, updated: number): string {
  const created = KINDS.reduce((n, k) => n + counts[k], 0);
  const update = updated > 1 ? tr("{n} éléments mis à jour.", { n: updated }) : tr("Un élément mis à jour.");
  if (updated === 0) return importedMessage(counts);
  return created === 0 ? update : `${importedMessage(counts)} ${update}`;
}

/** « Tâche importée. », « 3 événements importés. », « 12 éléments importés. » */
export function importedMessage(counts: Readonly<Record<ImportKind, number>>): string {
  const kinds = KINDS.filter((k) => counts[k] > 0);
  const total = kinds.reduce((n, k) => n + counts[k], 0);
  if (kinds.length === 1) return IMPORTED[kinds[0]!](total);
  return tr("{n} éléments importés.", { n: total });
}

interface ImportDialogProps {
  file: ImportFile;
  /** Après l'import : ranger le fichier dans Import\Traités plutôt que le supprimer. */
  keepFiles: boolean;
  onClose: () => void;
}

/**
 * Aperçu avant import : ce qui va être créé, lignes en erreur avec leur explication, doublons
 * décochés. Rien n'entre sans « Importer » ; l'import entier s'annule ensuite d'un clic.
 */
export function ImportDialog({ file, keepFiles, onClose }: ImportDialogProps) {
  const notify = useToast();
  const { spaces, filter } = useSpaces();
  const { tasks } = useTasks();
  const { events } = useEvents();
  const { obligations, categories } = useObligations();
  const { notes, notebooks } = useNotes();
  const { habits } = useHabits();
  const contacts = useContactsIfAny()?.contacts ?? [];
  const budget = useBudgetIfAny();
  const listsData = useListsIfAny();
  const [now] = useState(() => new Date());
  const [content, setContent] = useState<ImportFileContent | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, SourceChoice>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Lignes qui remplacent des éléments existants : confirmées avant l'import.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let stale = false;
    importApi
      .read(file.path)
      .then((bytes) => readImportFile(file.name, bytes))
      .then((c) => !stale && setContent(c))
      .catch((e: unknown) => !stale && setReadError(e instanceof ImportFileError ? e.message : importErrorMessage(e)));
    return () => {
      stale = true;
    };
  }, [file.path, file.name]);

  const ctx = useMemo<ImportContext>(
    () => ({
      now,
      today: dayKey(now),
      date1904: content?.date1904 ?? false,
      spaces,
      defaultSpaceId: filter !== "tous" && spaces.some((s) => s.id === filter) ? filter : (spaces[0]?.id ?? null),
      notebooks,
      categories,
      defaultReminder: readDefaultReminder(),
      budgetCategories: budget?.categories ?? [],
      lists: listsData?.lists ?? [],
      existing: {
        tasks,
        events,
        obligations,
        notes,
        habits,
        contacts,
        transactions: budget?.transactions ?? [],
        listItems: (listsData?.lists ?? []).flatMap((l) => (listsData?.items.get(l.id) ?? []).map((i) => ({ list: l.name, title: i.title }))),
      },
    }),
    // Éléments existants lus à l'ouverture (doublons) : l'aperçu ne bouge pas s'ils changent.
    [now, content, spaces, filter, notebooks, categories],
  );

  const previews: SourcePreview[] = useMemo(() => (content ? previewSources(content.sources, choices, ctx) : []), [content, choices, ctx]);
  const rows = previews.flatMap((p) => p.rows);
  const isChecked = (row: ImportRow) => row.item !== null && (overrides[row.id] ?? row.checked);
  const selected = rows.filter(isChecked);
  const counts = Object.fromEntries(KINDS.map((k) => [k, selected.filter((r) => r.kind === k).length])) as Record<ImportKind, number>;
  const updating = selected.filter((r) => r.replaces);
  const createdCounts = Object.fromEntries(KINDS.map((k) => [k, selected.filter((r) => r.kind === k && !r.replaces).length])) as Record<ImportKind, number>;
  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  const duplicateCount = rows.filter((r) => r.duplicate && r.item).length;

  const choose = (sourceId: string, choice: SourceChoice) => {
    setChoices((c) => ({ ...c, [sourceId]: choice }));
    // Nouvelles lignes : les cases reprennent leur état d'origine.
    setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([id]) => !id.startsWith(`${sourceId}:`))));
  };

  const toggleAll = (list: readonly ImportRow[], checked: boolean) =>
    setOverrides((o) => ({ ...o, ...Object.fromEntries(list.filter((r) => r.item).map((r) => [r.id, checked])) }));

  const runImport = async () => {
    if (busy || selected.length === 0) return;
    if (updating.length > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    setError(null);
    // Mises à jour : l'élément garde ce que le fichier ne décrit pas ; ses valeurs d'avant
    // permettent d'annuler l'import.
    const { rows: ready, previous } = prepareUpdates(selected, { tasks, events, contacts, transactions: budget?.transactions ?? [] });
    const { batch, origin } = toBatch(ready);
    let created: Created;
    try {
      created = await importApi.apply(batch, dayKey(new Date()));
    } catch (e) {
      const failure = e as Partial<ImportFailure>;
      const row = failure.kind && failure.index != null ? origin[failure.kind][failure.index] : undefined;
      const source = row ? previews.find((p) => p.rows.includes(row))?.source.label : undefined;
      setError(
        row
          ? source
            ? tr("{source}, ligne {line} : {message}", { source, line: row.line, message: failureMessage(e) })
            : tr("Ligne {line} : {message}", { line: row.line, message: failureMessage(e) })
          : failureMessage(e),
      );
      setBusy(false);
      return;
    }
    const kinds = [...new Set(KINDS.filter((k) => counts[k] > 0).map((k) => DATA_OF[k]))];
    announceData(kinds);
    if (file.inFolder) {
      await importApi.finish(file.path, keepFiles).catch(() => undefined);
    }
    notify(importedAndUpdatedMessage(createdCounts, updating.length), {
      label: tr("Annuler|action"),
      undo: "import",
      run: async () => {
        try {
          await importApi.undo(created, updating.length > 0 ? previous : null, dayKey(new Date()));
          announceData(kinds);
          notify(tr("Import annulé."));
        } catch (err) {
          notify(failureMessage(err));
        }
      },
    });
    onClose();
  };

  const title = tr("Importer « {name} »", { name: file.name });

  if (readError || !content) {
    return (
      <Dialog title={title} onClose={onClose}>
        <div className="settings-form">
          {readError ? (
            <p className="form-error" role="alert">
              {readError}
            </p>
          ) : (
            <p className="settings-intro">{tr("Lecture du fichier…")}</p>
          )}
          <div className="onb-actions">
            <button type="button" className="btn-glass" onClick={onClose} data-autofocus>
              {tr("Fermer")}
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  const total = selected.length;
  const after = !file.inFolder
    ? null
    : keepFiles
      ? tr("Après l'import, le fichier est rangé dans Import\\Traités.")
      : tr("Après l'import, le fichier est supprimé du dossier d'import.");

  return (
    <Dialog title={title} onClose={onClose} className="dialog--wide import-dialog">
      <div className="import-summary" aria-live="polite">
        {/* Éléments créés ; les mises à jour ont leur propre pastille. */}
        {KINDS.filter((k) => createdCounts[k] > 0).map((k) => (
          <span key={k} className="import-chip" style={kindStyle(k)}>
            <Icon d={getModule(MODULE_OF[k]).icon} size={13} stroke={2.4} />
            {countLabel(k, createdCounts[k])}
          </span>
        ))}
        {total === 0 && <span className="import-chip import-chip--empty">{tr("Aucun élément coché")}</span>}
        {errorCount > 0 && (
          <span className="import-chip import-chip--error">
            <Icon d={ICONS.warning} size={13} stroke={2.4} />
            {trn(errorCount, "{n} ligne en erreur", "{n} lignes en erreur")}
          </span>
        )}
        {updating.length > 0 && (
          <span className="import-chip import-chip--update">
            <Icon d={ICONS.repeat} size={13} stroke={2.4} />
            {trn(updating.length, "{n} mise à jour", "{n} mises à jour")}
          </span>
        )}
        {duplicateCount > 0 && (
          <span className="import-chip import-chip--duplicate">
            <Icon d={ICONS.layers} size={13} stroke={2.4} />
            {trn(duplicateCount, "{n} doublon", "{n} doublons")}
          </span>
        )}
      </div>

      <div className="import-sources">
        {previews.map((p) => (
          <SourceSection
            key={p.source.id}
            preview={p}
            isChecked={isChecked}
            onToggle={(row, checked) => setOverrides((o) => ({ ...o, [row.id]: checked }))}
            onToggleAll={toggleAll}
            onChoose={(choice) => choose(p.source.id, choice)}
            choice={choices[p.source.id]}
          />
        ))}
      </div>

      {after && <p className="import-after">{after}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="onb-actions">
        <button type="button" className="btn-glass" onClick={onClose} disabled={busy}>
          {tr("Annuler")}
        </button>
        <button type="button" className="btn-gel" disabled={busy || total === 0} onClick={() => void runImport()} data-autofocus>
          {total > 0 ? trn(total, "Importer {n} élément", "Importer {n} éléments") : tr("Importer")}
        </button>
      </div>
      {confirming && <ConfirmUpdates rows={updating} onCancel={() => setConfirming(false)} onConfirm={() => void runImport()} />}
    </Dialog>
  );
}

/** Rappel avant de remplacer des éléments existants par le contenu du fichier. */
function ConfirmUpdates({ rows, onCancel, onConfirm }: { rows: readonly ImportRow[]; onCancel: () => void; onConfirm: () => void }) {
  const shown = rows.slice(0, 6);
  const n = rows.length;
  return (
    <Dialog title={tr("Mise à jour d'éléments existants")} onClose={onCancel}>
      <div className="settings-form">
        <p className="onb-text">
          {n > 1 ? tr("{n} éléments déjà dans Aqueli sont remplacés par le contenu du fichier :", { n }) : tr("Un élément déjà dans Aqueli est remplacé par le contenu du fichier :")}
        </p>
        <ul className="import-update-list">
          {shown.map((r) => (
            <li key={r.id}>
              {r.kind && <span className="import-kind">{KIND_LABELS[r.kind].one}</span>}
              <span className="import-title">{r.title || tr("Sans titre")}</span>
            </li>
          ))}
          {n > shown.length && <li className="import-update-more">{tr("{n} de plus", { n: n - shown.length })}</li>}
        </ul>
        <p className="settings-hint"><Sentences text={tr("Ce que le fichier ne décrit pas est gardé (couleur, projet, photo, sous-tâches cochées). « Annuler », après l'import, rétablit les valeurs d'avant.")} /></p>
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onCancel}>
            {tr("Retour")}
          </button>
          <button type="button" className="btn-gel" onClick={onConfirm} data-autofocus>
            {tr("Mettre à jour et importer")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

interface SourceSectionProps {
  preview: SourcePreview;
  choice: SourceChoice | undefined;
  isChecked: (row: ImportRow) => boolean;
  onToggle: (row: ImportRow, checked: boolean) => void;
  onToggleAll: (rows: readonly ImportRow[], checked: boolean) => void;
  onChoose: (choice: SourceChoice) => void;
}

function SourceSection({ preview, choice, isChecked, onToggle, onToggleAll, onChoose }: SourceSectionProps) {
  const { source, rows, ignored } = preview;
  const selectable = rows.filter((r) => r.item);
  const allChecked = selectable.length > 0 && selectable.every(isChecked);
  const mixed = source.type === "table" && (choice ?? source.kind) === "mixed";

  let picker: ReactNode = null;
  if (source.type === "table") {
    const options: SelectOption<ImportKind | "mixed">[] = source.hasTypeColumn ? [MIXED, ...TABLE_CHOICES] : TABLE_CHOICES;
    picker = (
      <label className="import-picker">
        <span>{tr("Contenu")}</span>
        <Select value={(choice as ImportKind | "mixed" | undefined) ?? source.kind} options={options} onChange={onChoose} label={tr("Contenu")} />
      </label>
    );
  } else if (source.type === "text" && !source.typed) {
    picker = (
      <label className="import-picker">
        <span>{tr("Lecture")}</span>
        <Select value={(choice as TextMode | undefined) ?? source.mode} options={TEXT_CHOICES} onChange={onChoose} label={tr("Lecture")} />
      </label>
    );
  }

  return (
    <section className="import-source" aria-label={source.label}>
      <header className="import-source-head">
        {selectable.length > 0 && (
          <label className="checkbox import-check" title={allChecked ? tr("Tout décocher") : tr("Tout cocher")}>
            <input type="checkbox" className="checkbox-input" checked={allChecked} onChange={(e) => onToggleAll(rows, e.target.checked)} />
            <span className="checkbox-bubble" aria-hidden="true">
              {allChecked && <Icon d={ICONS.check} size={12} stroke={3.5} />}
            </span>
            <span className="sr-only">{tr("Tout cocher")}</span>
          </label>
        )}
        <h3 className="import-source-title">{source.label}</h3>
        {source.type === "later" ? <span className="import-soon">{tr("Bientôt disponible")}</span> : picker}
        {source.type === "records" && <span className="import-soon">{KIND_LABELS[source.kind].many}</span>}
      </header>
      {source.type === "table" && source.guessed && choice === undefined && (
        <p className="import-note">{tr("Contenu déduit des colonnes.")}</p>
      )}
      {ignored.length > 0 && <p className="import-note">{tr("Colonnes ignorées : {list}.", { list: ignored.join(", ") })}</p>}
      {source.type === "later" && <p className="import-note">{tr("{sheet} : bientôt disponible. Cet onglet est ignoré.", { sheet: source.later })}</p>}
      {rows.length > 0 && (
        <ul className="import-rows">
          {rows.map((row) => (
            <Row key={row.id} row={row} checked={isChecked(row)} showKind={mixed || source.type === "text"} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ row, checked, showKind, onToggle }: { row: ImportRow; checked: boolean; showKind: boolean; onToggle: (row: ImportRow, checked: boolean) => void }) {
  const state = row.errors.length > 0 ? "error" : row.duplicate ? "duplicate" : row.replaces ? "update" : undefined;
  const message =
    row.errors.length > 0 ? row.errors.join(" ") : [row.duplicate, row.replaces ? tr("Mise à jour d'un élément existant.") : null, ...row.warnings].filter(Boolean).join(" ");
  return (
    <li className="import-row" data-state={state} data-unchecked={!checked || undefined} style={row.kind ? kindStyle(row.kind) : undefined}>
      <label className="checkbox import-check" data-disabled={!row.item || undefined}>
        <input type="checkbox" className="checkbox-input" checked={checked} disabled={!row.item} onChange={(e) => onToggle(row, e.target.checked)} />
        <span className="checkbox-bubble" aria-hidden="true">
          {checked && <Icon d={ICONS.check} size={12} stroke={3.5} />}
        </span>
        <span className="sr-only">
          {row.title ? tr("Importer la ligne {line} : {title}", { line: row.line, title: row.title }) : tr("Importer la ligne {line}", { line: row.line })}
        </span>
      </label>
      <span className="import-line" title={tr("Ligne {line}", { line: row.line })}>
        {row.line}
      </span>
      <span className="import-main">
        {showKind && row.kind && <span className="import-kind">{KIND_LABELS[row.kind].one}</span>}
        <span className="import-title">{row.title || tr("Sans titre")}</span>
      </span>
      <span className="import-when">{row.when}</span>
      <span className="import-details">{row.details.join(" · ")}</span>
      {message && (
        <span className="import-message" data-state={state ?? "warning"}>
          {state === "error" && <Icon d={ICONS.warning} size={12} stroke={2.4} />}
          {message}
        </span>
      )}
    </li>
  );
}
