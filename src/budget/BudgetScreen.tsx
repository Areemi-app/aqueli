/**
 * Écran Budget (cahier des charges § 4.15) : mois affiché, dépenses, revenus et solde (charges
 * fixes, revenus à venir, reste par jour), opérations du mois, échéances à venir des opérations
 * récurrentes, obligations du mois reprises des Obligations, part de chaque catégorie, budgets
 * par catégorie, six derniers mois ; recherche dans toutes les opérations. Aucune connexion
 * bancaire.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from "react";
import { useBulk } from "../app/bulk";
import { useToast } from "../app/ToastProvider";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { BarChart, Donut } from "../components/Charts";
import { ScreenTitle } from "../components/ScreenTitle";
import { submenuEntry, useItemMenu, useScreenMenu, type MenuEntry } from "../components/ContextMenu";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { MoreOptions } from "../components/MoreOptions";
import { Segmented } from "../components/Segmented";
import { Select } from "../components/SelectRow";
import { SelectionBar, selectionEntries, useSelection, type SelectionAction } from "../components/SelectionBar";
import { SymbolPicker } from "../components/SymbolPicker";
import { symbolPath } from "../components/symbols";
import { ColorChoices } from "../components/ColorChoices";
import { KEYS } from "../lib/itemKeys";
import { dragLabel, dropTarget, moved, startDrag } from "../lib/dragDrop";
import { NEW_ITEM, transactionRequest } from "../lib/request";
import { useNow } from "../lib/useNow";
import { getModule } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { formatAmount, parseAmount } from "../obligations/obligations";
import { requestObligation } from "../obligations/obligationRequest";
import { useObligations } from "../obligations/ObligationsProvider";
import { useNewItem } from "../shell/newItem";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays, dayKey, formatShortDay } from "../tasks/day";
import {
  budgetUse,
  history,
  isRecurring,
  monthLabel,
  monthOf,
  perDayLeft,
  plannedPayments,
  REPEAT_CHOICES,
  repeatLabel,
  scheduledIn,
  searchTransactions,
  shiftMonth,
  shortMonthLabel,
  summarize,
  type BudgetCategory,
  type CategoryInput,
  type ScheduledOccurrence,
  type Transaction,
  type TransactionKind,
} from "./budget";
import { exportBudgetCsv } from "./api";
import { useBudget } from "./BudgetProvider";
import { toBudgetCsv } from "./exportCsv";
import { DateField } from "../components/DateField";
import { tr, trn } from "../i18n/i18n";

const OTHER_COLOR = "#5a7d99";

// ——— Saisie d'une opération ———

const NEW_CATEGORY = "__nouvelle";
const REPEAT_OPTIONS = REPEAT_CHOICES.map((c) => ({ value: c.value === null ? "" : String(c.value), label: c.label, icon: c.value === null ? undefined : ICONS.repeat }));
/** Résultats de recherche affichés au plus. */
const MAX_RESULTS = 300;

interface TransactionDialogProps {
  transaction?: Transaction;
  kind: TransactionKind;
  onClose: () => void;
  /** Ouvre l'opération d'origine d'une échéance. */
  onSeries?: (source: Transaction) => void;
}

function TransactionDialog({ transaction, kind, onClose, onSeries }: TransactionDialogProps) {
  const { categories, transactions, create, update, createCategory } = useBudget();
  const source = transaction?.seriesId ? transactions.find((t) => t.id === transaction.seriesId) : undefined;
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const { spaces, filter } = useSpaces();
  const today = dayKey(useNow());
  const [form, setForm] = useState({
    kind: transaction?.kind ?? kind,
    amount: transaction ? (transaction.amountCents / 100).toFixed(2).replace(".", ",") : "",
    day: transaction?.day ?? today,
    label: transaction?.label ?? "",
    categoryId: transaction?.categoryId ?? "",
    notes: transaction?.notes ?? "",
    spaceId: transaction?.spaceId ?? (filter !== "tous" ? filter : ""),
    repeat: transaction?.repeatMonths ? String(transaction.repeatMonths) : "",
    until: transaction?.repeatUntil ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const set = (changes: Partial<typeof form>) => setForm((f) => ({ ...f, ...changes }));
  const cats = categories.filter((c) => c.kind === form.kind);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmount(form.amount);
    if (cents === null || Number.isNaN(cents) || cents <= 0) {
      setError(tr("Saisissez un montant (par exemple 42,50)."));
      return;
    }
    if (!form.label.trim()) {
      setError(tr("Saisissez un libellé."));
      return;
    }
    if (form.repeat && form.until && form.until < form.day) {
      setError(tr("La fin de la répétition précède la date de l'opération."));
      return;
    }
    const input = {
      kind: form.kind,
      amountCents: cents,
      day: form.day,
      label: form.label.trim(),
      categoryId: cats.some((c) => c.id === form.categoryId) ? form.categoryId : null,
      notes: form.notes,
      spaceId: form.spaceId || null,
      repeatMonths: form.repeat ? Number(form.repeat) : null,
      repeatUntil: form.repeat && form.until ? form.until : null,
    };
    if (transaction) await update(transaction, input);
    else await create(input);
    onClose();
  };
  return (
    <Dialog title={transaction ? tr("Opération") : form.kind === "revenu" ? tr("Nouveau revenu") : tr("Nouvelle dépense")} onClose={onClose}>
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        <Segmented value={form.kind} options={[{ value: "depense", label: tr("Dépense") }, { value: "revenu", label: tr("Revenu") }]} label={tr("Sorte")} onChange={(k) => set({ kind: k, categoryId: "" })} />
        <div className="budget-form-row">
          <div className="field">
            <label htmlFor={`${ids}-montant`} className="field-label">
              {tr("Montant")}
            </label>
            <div className="field-box" data-invalid={error?.startsWith("Saisissez un montant") || undefined}>
              <input id={`${ids}-montant`} className="field-input" inputMode="decimal" placeholder="0,00 €" value={form.amount} onChange={(e) => set({ amount: e.target.value })} data-autofocus />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${ids}-date`} className="field-label">
              {tr("Date")}
            </label>
            <div className="field-box">
              <DateField id={`${ids}-date`} className="field-input" value={form.day} onChange={(v) => v && set({ day: v })} />
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-libelle`} className="field-label">
            {tr("Libellé")}
          </label>
          <div className="field-box">
            <input id={`${ids}-libelle`} className="field-input" maxLength={200} placeholder={form.kind === "revenu" ? tr("Salaire, remboursement…") : tr("Marché, essence, cinéma…")} value={form.label} onChange={(e) => set({ label: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-categorie`} className="field-label">
            {tr("Catégorie")}
          </label>
          <Select
            id={`${ids}-categorie`}
            value={newCategory !== null ? NEW_CATEGORY : form.categoryId}
            options={[{ value: "", label: tr("Sans catégorie") }, ...cats.map((c) => ({ value: c.id, label: c.name })), { value: NEW_CATEGORY, label: tr("Nouvelle catégorie…") }]}
            onChange={(v) => {
              if (v === NEW_CATEGORY) setNewCategory("");
              else {
                setNewCategory(null);
                set({ categoryId: v });
              }
            }}
          />
          {newCategory !== null && (
            <div className="budget-new-category">
              <div className="field-box">
                <input
                  className="field-input"
                  aria-label={tr("Nom de la nouvelle catégorie")}
                  placeholder={form.kind === "revenu" ? tr("Loyer perçu, prime…") : tr("Animaux, abonnements…")}
                  maxLength={60}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  autoFocus
                />
              </div>
              <button
                type="button"
                className="btn-glass btn-glass--sm"
                disabled={!newCategory.trim()}
                onClick={async () => {
                  const created = await createCategory({ name: newCategory.trim(), kind: form.kind, icon: form.kind === "revenu" ? "argent" : "etoile", color: form.kind === "revenu" ? "#1f9a6e" : "#5a7d99", monthlyCents: null });
                  if (created) {
                    set({ categoryId: created.id });
                    setNewCategory(null);
                  }
                }}
              >
                {tr("Créer")}
              </button>
            </div>
          )}
        </div>
        {transaction?.seriesId ? (
          <p className="budget-series-note">
            <Icon d={ICONS.repeat} size={14} stroke={2.2} />
            <span>
              {source
                ? tr("Échéance d'une opération récurrente ({repeat}).", { repeat: repeatLabel(source.repeatMonths).toLowerCase() })
                : tr("Échéance d'une opération récurrente.")}{" "}
              {tr("Les modifications ne concernent que ce jour.")}
            </span>
            {source && onSeries && (
              <button type="button" className="link-btn" onClick={() => onSeries(source)}>
                {tr("Modifier la série")}
              </button>
            )}
          </p>
        ) : (
          <div className="budget-form-row">
            <div className="field">
              <label htmlFor={`${ids}-repetition`} className="field-label">
                {tr("Répétition")}
              </label>
              <Select id={`${ids}-repetition`} value={form.repeat} options={REPEAT_OPTIONS} onChange={(v) => set({ repeat: v })} />
            </div>
            {form.repeat && (
              <div className="field">
                <label htmlFor={`${ids}-jusqua`} className="field-label">
                  {tr("Jusqu'au")}
                </label>
                <div className="field-box">
                  <DateField id={`${ids}-jusqua`} className="field-input" value={form.until} min={form.day} clearable placeholder={tr("Sans fin")} onChange={(v) => set({ until: v })} />
                </div>
              </div>
            )}
          </div>
        )}
        <MoreOptions open={!!transaction && (!!transaction.notes || (!!transaction.spaceId && transaction.spaceId !== (filter !== "tous" ? filter : null)))}>
          <div className="field">
            <label htmlFor={`${ids}-notes`} className="field-label">
              {tr("Notes")}
            </label>
            <textarea id={`${ids}-notes`} className="detail-notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-espace`} className="field-label">
              {tr("Espace")}
            </label>
            <Select id={`${ids}-espace`} value={form.spaceId} options={[{ value: "", label: tr("Tous les espaces") }, ...spaces.map((s) => ({ value: s.id, label: s.name }))]} onChange={(v) => set({ spaceId: v })} />
          </div>
        </MoreOptions>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel">
            {transaction ? tr("Enregistrer") : tr("Ajouter")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ——— Catégories et budgets ———

function CategoryDialog({ category, kind, onClose }: { category?: BudgetCategory; kind: TransactionKind; onClose: () => void }) {
  const { createCategory, updateCategory } = useBudget();
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "etoile");
  const [color, setColor] = useState<string | null>(category?.color ?? "#2d6ff0");
  const [limit, setLimit] = useState(category?.monthlyCents ? (category.monthlyCents / 100).toFixed(0) : "");
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const k = category?.kind ?? kind;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(tr("Saisissez un nom."));
      return;
    }
    const cents = limit.trim() ? parseAmount(limit) : null;
    if (cents !== null && Number.isNaN(cents)) {
      setError(tr("Budget illisible."));
      return;
    }
    const input: CategoryInput = { name: name.trim(), kind: k, icon, color, monthlyCents: cents };
    if (category) await updateCategory(category, input);
    else await createCategory(input);
    onClose();
  };
  return (
    <Dialog title={category ? tr("Catégorie") : tr("Nouvelle catégorie")} onClose={onClose}>
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor={`${ids}-nom`} className="field-label">
            {tr("Nom")}
          </label>
          <div className="field-box" data-invalid={error === tr("Saisissez un nom.") || undefined}>
            <input id={`${ids}-nom`} className="field-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        {k === "depense" && (
          <div className="field">
            <label htmlFor={`${ids}-budget`} className="field-label">
              {tr("Budget du mois")}
            </label>
            <div className="field-box">
              <input id={`${ids}-budget`} className="field-input" inputMode="decimal" placeholder={tr("Aucun")} value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
          </div>
        )}
        <div className="field">
          <span className="field-label">{tr("Symbole")}</span>
          <SymbolPicker value={icon} onChange={setIcon} label={tr("Symbole de la catégorie")} color={color} />
        </div>
        <div className="field">
          <span className="field-label">{tr("Couleur")}</span>
          <ColorChoices value={color} onChange={setColor} label={tr("Couleur de la catégorie")} />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel">
            {category ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ——— Écran ———

function Stat({ label, value, tone, glow, sub }: { label: string; value: string; tone?: "bon" | "mauvais"; glow?: TransactionKind; sub?: string | null }) {
  return (
    <div className="budget-stat glass" data-tone={tone} data-glow={glow}>
      <span className="budget-stat-label">{label}</span>
      <strong className="budget-stat-value">{value}</strong>
      {sub && <span className="budget-stat-sub">{sub}</span>}
    </div>
  );
}

/** Signe moins des dépenses. */
const MINUS = "M5 12h14";

/** Boutons « Nouvelle dépense » (rouge) et « Nouveau revenu » (vert). */
function MoneyButtons({ large, onAdd }: { large?: boolean; onAdd: (kind: TransactionKind) => void }) {
  return (
    <div className="budget-money-buttons" data-large={large || undefined}>
      <button type="button" className="btn-money" data-kind="depense" onClick={() => onAdd("depense")} title={tr("Nouvelle dépense ({create})", { create: KEYS.create })}>
        <Icon d={MINUS} size={large ? 18 : 15} stroke={3} />
        {tr("Nouvelle dépense")}
      </button>
      <button type="button" className="btn-money" data-kind="revenu" onClick={() => onAdd("revenu")}>
        <Icon d={ICONS.plus} size={large ? 18 : 15} stroke={3} />
        {tr("Nouveau revenu")}
      </button>
    </div>
  );
}

export function BudgetScreen() {
  const { categories, transactions, visible, loaded, remove, create, update, removeCategory, reorderCategories } = useBudget();
  const { obligations } = useObligations();
  const { spaces, filter } = useSpaces();
  const { go } = useNavigation();
  const itemMenu = useItemMenu();
  const bulk = useBulk();
  const notify = useToast();
  const today = dayKey(useNow());
  const [pending] = useState(transactionRequest.take);
  const asked = pending && pending !== NEW_ITEM ? transactions.find((t) => t.id === pending) : undefined;
  const [month, setMonth] = useState(() => (asked ? monthOf(asked.day) : monthOf(today)));
  const [dialog, setDialog] = useState<{ transaction?: Transaction; kind: TransactionKind } | null>(() =>
    pending === NEW_ITEM ? { kind: "depense" } : asked ? { transaction: asked, kind: asked.kind } : null,
  );
  const [categoryEdit, setCategoryEdit] = useState<{ category?: BudgetCategory; kind: TransactionKind } | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const m = getModule("budget");

  // Ctrl+F : recherche dans toutes les opérations.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(
    () =>
      transactionRequest.on((id) => {
        if (id === NEW_ITEM) return setDialog({ kind: "depense" });
        const t = transactions.find((x) => x.id === id);
        if (!t) return;
        setMonth(monthOf(t.day));
        setDialog({ transaction: t, kind: t.kind });
      }),
    [transactions],
  );
  useNewItem(() => setDialog({ kind: "depense" }));
  useScreenMenu(() => [
    { label: tr("Nouvelle dépense"), icon: ICONS.plus, shortcut: KEYS.create, run: () => setDialog({ kind: "depense" }) },
    { label: tr("Nouveau revenu"), icon: ICONS.plus, run: () => setDialog({ kind: "revenu" }) },
    submenuEntry(tr("Nouvelle catégorie"), ICONS.folder, [
      { label: tr("Nouvelle catégorie de dépense…"), icon: ICONS.folder, run: () => setCategoryEdit({ kind: "depense" }) },
      { label: tr("Nouvelle catégorie de revenu…"), icon: ICONS.folder, run: () => setCategoryEdit({ kind: "revenu" }) },
    ]),
    "separator",
    { label: tr("Exporter les opérations du mois (.csv)…"), icon: ICONS.save, run: () => void exportMonth() },
  ]);

  /** Opérations du mois affiché, en tableau CSV réimportable. */
  async function exportMonth() {
    const ops = visible.filter((t) => monthOf(t.day) === month);
    if (ops.length === 0) return notify(tr("Aucune opération ce mois-ci."));
    try {
      const path = await exportBudgetCsv(tr("Budget {month}", { month: monthLabel(month).toLowerCase() }), toBudgetCsv(ops, categories, spaces));
      if (path) notify(ops.length > 1 ? tr("{length} opérations exportées.", { length: ops.length }) : tr("Opération exportée."));
    } catch (err) {
      notify(dataErrorMessage(err as DataError));
    }
  }

  const shownObligations = obligations.filter((o) => filter === "tous" || o.spaceId === filter || o.spaceId === null);
  const payments = plannedPayments(shownObligations, month);
  const scheduled = scheduledIn(visible, month);
  const summary = summarize(visible, payments, month, scheduled);
  const perDay = perDayLeft(summary.balance, today, month);
  const searching = query.trim().length >= 2;
  const found = useMemo(() => (searching ? searchTransactions(visible, query, categories) : []), [searching, visible, query, categories]);
  const inMonth = visible.filter((t) => monthOf(t.day) === month);
  const catOf = (id: string | null) => categories.find((c) => c.id === id);
  const expenseCats = categories.filter((c) => c.kind === "depense");
  const incomeCats = categories.filter((c) => c.kind === "revenu");
  const parts = [
    ...expenseCats.map((c) => ({ label: c.name, value: summary.byCategory.get(c.id) ?? 0, color: c.color ?? OTHER_COLOR })),
    { label: tr("Sans catégorie"), value: summary.byCategory.get(null) ?? 0, color: OTHER_COLOR },
    { label: tr("Obligations"), value: summary.planned, color: getModule("obligations").color },
  ].filter((p) => p.value > 0);
  const past = history(visible, shownObligations, month);

  const pick = useSelection(inMonth.map((t) => t.id));
  const picked = inMonth.filter((t) => pick.has(t.id));
  const each = (fn: (t: Transaction) => Promise<unknown>) => async () => {
    for (const t of picked) await fn(t);
  };
  const bulkActions: SelectionAction[] = [
    {
      label: tr("Catégorie"),
      icon: ICONS.folder,
      run: () => {},
      menu: () =>
        categories
          .filter((c) => picked.every((t) => t.kind === c.kind))
          .map((c) => ({ label: tr("Ranger dans « {name} »", { name: c.name }), icon: symbolPath(c.icon, ICONS.folder), run: () => void bulk(trn(picked.length, "Opération rangée.", "{n} opérations rangées."), tr("changement de catégorie"), each((t) => update(t, { categoryId: c.id }))) })),
    },
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void bulk(trn(picked.length, "Opération supprimée.", "{n} opérations supprimées."), tr("suppression des opérations"), each((t) => remove(t))) },
  ];
  const bulkEntries = pick.count > 1 ? selectionEntries(bulkActions) : null;

  const sourceOf = (t: Transaction) => (t.seriesId ? transactions.find((x) => x.id === t.seriesId) : undefined);
  const rowMenu = (t: Transaction): MenuEntry[] => {
    if (bulkEntries && pick.has(t.id)) return bulkEntries;
    const source = sourceOf(t);
    return [
      { label: tr("Modifier…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setDialog({ transaction: t, kind: t.kind }) },
      { label: tr("Dupliquer"), icon: ICONS.layers, shortcut: KEYS.duplicate, run: () => void create({ day: today, amountCents: t.amountCents, kind: t.kind, categoryId: t.categoryId, label: t.label, notes: t.notes, spaceId: t.spaceId, repeatMonths: null, repeatUntil: null }) },
      ...(t.repeatMonths ? [{ label: tr("Arrêter la répétition"), icon: ICONS.stop, run: () => void update(t, { repeatMonths: null, repeatUntil: null }) }] : []),
      ...(source ? [{ label: tr("Modifier la série…"), icon: ICONS.repeat, run: () => setDialog({ transaction: source, kind: source.kind }) }] : []),
      ...categories
        .filter((c) => c.kind === t.kind && c.id !== t.categoryId)
        .map((c, i): MenuEntry[] => [...(i === 0 ? (["separator"] as MenuEntry[]) : []), { label: tr("Ranger dans « {name} »", { name: c.name }), icon: symbolPath(c.icon, ICONS.folder), run: () => void update(t, { categoryId: c.id }) }])
        .flat(),
      "separator",
      { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void remove(t) },
    ];
  };

  // Glisser des opérations (ou la sélection) sur une catégorie de la colonne de droite :
  // une dépense sur un budget, un revenu sur une catégorie de revenus.
  const dragTransactions = (t: Transaction) => (e: PointerEvent<HTMLElement>) => {
    const moved = (pick.has(t.id) && pick.count > 1 ? picked : [t]).filter((x) => x.kind === t.kind);
    const target = (key: string) => key.slice("categorie:".length);
    startDrag(
      e,
      { kind: `operation-${t.kind}`, ids: moved.map((x) => x.id), label: dragLabel(moved.length, t.label, tr("opérations")), color: catOf(t.categoryId)?.color ?? OTHER_COLOR },
      {
        canDrop: (key) => moved.some((x) => x.categoryId !== target(key)),
        onDrop: (key) => {
          const c = categories.find((x) => x.id === target(key));
          if (!c) return;
          const many = moved.length > 1;
          void bulk(many ? tr("{n} opérations rangées dans « {name} ».", { n: moved.length, name: c.name }) : tr("Opération rangée dans « {name} ».", { name: c.name }), tr("changement de catégorie"), async () => {
            for (const x of moved) if (x.categoryId !== c.id) await update(x, { categoryId: c.id });
          });
        },
      },
    );
  };

  /** Ligne d'une opération (mois affiché ou résultats de recherche). */
  const transactionRow = (t: Transaction) => {
    const c = catOf(t.categoryId);
    const color = c?.color ?? OTHER_COLOR;
    const menu = itemMenu(() => rowMenu(t));
    const repeats = isRecurring(t);
    return (
      <li key={t.id} className="budget-row" data-kind={t.kind} data-picked={pick.has(t.id) || undefined} style={{ "--row-color": color } as CSSProperties} onPointerDown={dragTransactions(t)} {...menu}>
        <button
          type="button"
          className="budget-row-main"
          onClick={(e) => {
            if (!pick.click(e, t.id)) setDialog({ transaction: t, kind: t.kind });
          }}
        >
          <ModuleChip color={color} icon={symbolPath(c?.icon, t.kind === "revenu" ? ICONS.arrowUp : ICONS.arrowDown)} size={26} />
          <span className="budget-row-text">
            <span className="budget-row-label">
              {t.label}
              {repeats && (
                <span className="budget-row-repeat" title={t.repeatMonths ? repeatLabel(t.repeatMonths) : tr("Échéance d'une opération récurrente")}>
                  <Icon d={ICONS.repeat} size={12} stroke={2.4} />
                </span>
              )}
            </span>
            <span className="budget-row-meta">
              {formatShortDay(t.day, today)} · {c?.name ?? tr("Sans catégorie")}
              {t.repeatMonths ? ` · ${repeatLabel(t.repeatMonths).toLowerCase()}` : ""}
              {t.spaceId && spaces.find((s) => s.id === t.spaceId) ? ` · ${spaces.find((s) => s.id === t.spaceId)!.name}` : ""}
            </span>
          </span>
          <span className="budget-row-amount">
            {t.kind === "revenu" ? "+" : "−"} {formatAmount(t.amountCents)}
          </span>
        </button>
      </li>
    );
  };

  /** Échéance à venir d'une opération récurrente : ouverte, elle modifie la série. */
  const scheduledRow = (s: ScheduledOccurrence) => {
    const t = s.source;
    const c = catOf(t.categoryId);
    const color = c?.color ?? OTHER_COLOR;
    const menu = itemMenu(() => [
      { label: tr("Modifier la série…"), icon: ICONS.repeat, shortcut: KEYS.open, run: () => setDialog({ transaction: t, kind: t.kind }) },
      { label: tr("Arrêter la répétition avant ce jour"), icon: ICONS.stop, run: () => void update(t, { repeatUntil: addDays(s.day, -1) }) },
    ]);
    return (
      <li key={`${t.id}-${s.day}`} className="budget-row budget-row--planned" data-kind={t.kind} style={{ "--row-color": color } as CSSProperties} {...menu}>
        <button type="button" className="budget-row-main" onClick={() => setDialog({ transaction: t, kind: t.kind })}>
          <ModuleChip color={color} icon={symbolPath(c?.icon, ICONS.repeat)} size={26} />
          <span className="budget-row-text">
            <span className="budget-row-label">{t.label}</span>
            <span className="budget-row-meta">
              {formatShortDay(s.day, today)} · {repeatLabel(t.repeatMonths).toLowerCase()}
            </span>
          </span>
          <span className="budget-row-amount">
            {t.kind === "revenu" ? "+" : "−"} {formatAmount(t.amountCents)}
          </span>
        </button>
      </li>
    );
  };

  // Résultats de recherche, par mois.
  const foundByMonth: [string, Transaction[]][] = [];
  for (const t of found.slice(0, MAX_RESULTS)) {
    const last = foundByMonth[foundByMonth.length - 1];
    if (last && last[0] === monthOf(t.day)) last[1].push(t);
    else foundByMonth.push([monthOf(t.day), [t]]);
  }

  return (
    <div className="screen budget-screen">
      <header className="tasks-header">
        <ScreenTitle module="budget" />
        <div className="budget-month" role="group" aria-label={tr("Mois affiché")}>
          <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Mois précédent")} title={tr("Mois précédent")} onClick={() => setMonth((x) => shiftMonth(x, -1))}>
            <Icon d={ICONS.arrowLeft} size={14} stroke={2.4} />
          </button>
          <button type="button" className="budget-month-label" onClick={() => setMonth(monthOf(today))} title={tr("Revenir au mois en cours")}>
            {monthLabel(month)}
          </button>
          <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Mois suivant")} title={tr("Mois suivant")} onClick={() => setMonth((x) => shiftMonth(x, 1))}>
            <Icon d={ICONS.arrowRight} size={14} stroke={2.4} />
          </button>
        </div>
        <div className="field-box notes-search">
          <Icon d={ICONS.search} size={15} />
          <input
            ref={searchRef}
            type="search"
            className="field-input"
            placeholder={tr("Rechercher une opération")}
            aria-label={tr("Rechercher une opération")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
          />
        </div>
        <span className="tasks-header-spacer" />
        <button type="button" className="btn-glass contacts-export" onClick={() => void exportMonth()} title={tr("Opérations du mois en tableau .csv (Excel)")}>
          <Icon d={ICONS.save} size={15} stroke={2.4} />
          <span>{tr("Exporter")}</span>
        </button>
      </header>

      <div className="budget-body">
        <div className="budget-main">
          <div className="budget-stats">
            <Stat label={tr("Dépenses")} glow="depense" value={formatAmount(summary.spent + summary.planned)} sub={summary.fixed ? tr("dont {formatAmount} de charges fixes", { formatAmount: formatAmount(summary.fixed) }) : null} />
            <Stat label={tr("Revenus")} glow="revenu" value={formatAmount(summary.income)} sub={summary.upcomingIncome ? tr("dont {formatAmount} à venir", { formatAmount: formatAmount(summary.upcomingIncome) }) : null} />
            <Stat
              label={tr("Solde")}
              value={`${summary.balance >= 0 ? "+" : "−"} ${formatAmount(Math.abs(summary.balance))}`}
              tone={summary.balance >= 0 ? "bon" : "mauvais"}
              sub={perDay !== null ? tr("soit {formatAmount} par jour d'ici la fin du mois", { formatAmount: formatAmount(perDay) }) : null}
            />
          </div>

          <section className="task-panel glass budget-panel" aria-label={searching ? tr("Résultats de la recherche") : tr("Opérations du mois")}>
            <div className="budget-panel-head">
              <h2 className="budget-panel-title">
                {searching ? (found.length === 0 ? tr("Aucune opération trouvée.") : trn(found.length, "{n} opération", "{n} opérations")) : tr("Opérations du mois")}
              </h2>
              {(searching || inMonth.length > 0) && <MoneyButtons onAdd={(kind) => setDialog({ kind })} />}
            </div>
            {searching ? (
              <div className="task-scroll">
                {foundByMonth.map(([mo, list]) => (
                  <div key={mo}>
                    <h3 className="task-section-title budget-planned-title">
                      {monthLabel(mo)}
                      <span className="task-section-sub"> · {list.length}</span>
                    </h3>
                    <ul className="budget-rows">{list.map(transactionRow)}</ul>
                  </div>
                ))}
                {found.length > MAX_RESULTS && <p className="budget-more">{tr("Les {n} plus récentes sont affichées. Précisez la recherche.", { n: MAX_RESULTS })}</p>}
              </div>
            ) : (
              <div className="task-scroll" onKeyDown={pick.onListKeyDown}>
                {loaded && inMonth.length === 0 && (
                  <div className="budget-empty">
                    <p>{tr("Aucune opération ce mois-ci.")}</p>
                    <MoneyButtons large onAdd={(kind) => setDialog({ kind })} />
                  </div>
                )}
                <ul className="budget-rows">{inMonth.map(transactionRow)}</ul>
                {scheduled.length > 0 && (
                  <>
                    <h3 className="task-section-title budget-planned-title">
                      {tr("À venir")}
                      <span className="task-section-sub">{tr(" · opérations récurrentes")}</span>
                    </h3>
                    <ul className="budget-rows">{scheduled.map(scheduledRow)}</ul>
                  </>
                )}
                {payments.length > 0 && (
                  <>
                    <h3 className="task-section-title budget-planned-title">
                      {tr("Obligations du mois")}
                      <span className="task-section-sub">{tr(" · reprises des Obligations")}</span>
                    </h3>
                    <ul className="budget-rows">
                      {payments.map((p) => (
                        <li key={`${p.obligation.id}-${p.day}`} className="budget-row budget-row--planned" data-kind="depense" style={{ "--row-color": getModule("obligations").color } as CSSProperties}>
                          <button
                            type="button"
                            className="budget-row-main"
                            onClick={() => {
                              go("obligations");
                              requestObligation({ id: p.obligation.id });
                            }}
                          >
                            <ModuleChip color={getModule("obligations").color} icon={getModule("obligations").icon} size={26} />
                            <span className="budget-row-text">
                              <span className="budget-row-label">{p.obligation.title}</span>
                              <span className="budget-row-meta">
                                {formatShortDay(p.day, today)}
                                {p.obligation.periodMonths ? (p.obligation.periodMonths === 1 ? tr(" · tous les mois") : tr(" · tous les {n} mois", { n: p.obligation.periodMonths })) : tr(" · ponctuelle")}
                              </span>
                            </span>
                            <span className="budget-row-amount">− {formatAmount(p.amountCents)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <SelectionBar count={pick.count} label={[tr("opération sélectionnée"), tr("opérations sélectionnées")]} actions={bulkActions} onClear={pick.clear} />
          </section>
        </div>

        <aside className="budget-side">
          <section className="glass budget-card" aria-label={tr("Répartition des dépenses")}>
            <h2 className="budget-panel-title">{tr("Répartition")}</h2>
            <div className="budget-split">
              <Donut parts={parts} center={formatAmount(summary.spent + summary.planned)} sub={tr("dépensés")} label={tr("Répartition des dépenses du mois")} />
              <ul className="budget-legend">
                {parts.slice(0, 7).map((p) => (
                  <li key={p.label}>
                    <span className="budget-legend-dot" style={{ background: p.color }} />
                    {p.label}
                    <strong>{formatAmount(p.value)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="glass budget-card" aria-label={tr("Budgets du mois")}>
            <div className="budget-card-head">
              <h2 className="budget-panel-title">{tr("Budgets du mois")}</h2>
              <button type="button" className="link-btn" onClick={() => setCategoryEdit({ kind: "depense" })}>
                <Icon d={ICONS.plus} size={12} stroke={2.6} />{tr(" Catégorie")}
              </button>
            </div>
            <ul className="budget-limits" data-sort="categories-depense">
              {expenseCats.map((c, i) => {
                const spent = summary.byCategory.get(c.id) ?? 0;
                const use = budgetUse(c, spent);
                const same = c.kind === "depense" ? expenseCats : incomeCats;
                const menu = itemMenu(() => [
                  { label: tr("Modifier…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setCategoryEdit({ category: c, kind: c.kind }) },
                  "separator",
                  { label: tr("Monter"), icon: ICONS.arrowUp, disabled: i === 0, run: () => void reorderCategories(moved(same.map((x) => x.id), i, -1)) },
                  { label: tr("Descendre"), icon: ICONS.arrowDown, disabled: i === same.length - 1, run: () => void reorderCategories(moved(same.map((x) => x.id), i, 1)) },
                  "separator",
                  { label: tr("Supprimer la catégorie"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void removeCategory(c) },
                ]);
                const dragCategory = (e: PointerEvent<HTMLElement>) =>
                  startDrag(e, { kind: "categorie-budget", ids: [c.id], label: c.name, color: c.color ?? OTHER_COLOR }, { sort: { group: `categories-${c.kind}`, onSort: (ids) => void reorderCategories(ids) } });
                return (
                  <li key={c.id} style={{ "--row-color": c.color ?? OTHER_COLOR } as CSSProperties}>
                    <button type="button" className="budget-limit" onClick={() => setCategoryEdit({ category: c, kind: c.kind })} {...dropTarget(`categorie:${c.id}`, `operation-${c.kind}`)} data-sort-id={c.id} onPointerDown={dragCategory} {...menu}>
                      <ModuleChip color={c.color ?? OTHER_COLOR} icon={symbolPath(c.icon, ICONS.star)} size={22} />
                      <span className="budget-limit-text">
                        <span className="budget-limit-name">{c.name}</span>
                        {use !== null && (
                          <span className="budget-limit-bar" data-over={use > 1 || undefined}>
                            <span style={{ width: `${Math.min(100, use * 100)}%` }} />
                          </span>
                        )}
                      </span>
                      <span className="budget-limit-amount">
                        {formatAmount(spent)}
                        {c.monthlyCents ? <small> / {formatAmount(c.monthlyCents)}</small> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="glass budget-card" aria-label={tr("Revenus du mois")}>
            <div className="budget-card-head">
              <h2 className="budget-panel-title">{tr("Revenus du mois")}</h2>
              <button type="button" className="link-btn" onClick={() => setCategoryEdit({ kind: "revenu" })}>
                <Icon d={ICONS.plus} size={12} stroke={2.6} />{tr(" Catégorie")}
              </button>
            </div>
            <ul className="budget-limits" data-sort="categories-revenu">
              {incomeCats.map((c, i) => {
                const received = inMonth.filter((t) => t.kind === "revenu" && t.categoryId === c.id).reduce((s, t) => s + t.amountCents, 0);
                const same = c.kind === "depense" ? expenseCats : incomeCats;
                const menu = itemMenu(() => [
                  { label: tr("Modifier…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setCategoryEdit({ category: c, kind: c.kind }) },
                  "separator",
                  { label: tr("Monter"), icon: ICONS.arrowUp, disabled: i === 0, run: () => void reorderCategories(moved(same.map((x) => x.id), i, -1)) },
                  { label: tr("Descendre"), icon: ICONS.arrowDown, disabled: i === same.length - 1, run: () => void reorderCategories(moved(same.map((x) => x.id), i, 1)) },
                  "separator",
                  { label: tr("Supprimer la catégorie"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void removeCategory(c) },
                ]);
                const dragCategory = (e: PointerEvent<HTMLElement>) =>
                  startDrag(e, { kind: "categorie-budget", ids: [c.id], label: c.name, color: c.color ?? OTHER_COLOR }, { sort: { group: `categories-${c.kind}`, onSort: (ids) => void reorderCategories(ids) } });
                return (
                  <li key={c.id} style={{ "--row-color": c.color ?? OTHER_COLOR } as CSSProperties} data-empty={received === 0 || undefined}>
                    <button type="button" className="budget-limit" onClick={() => setCategoryEdit({ category: c, kind: c.kind })} {...dropTarget(`categorie:${c.id}`, `operation-${c.kind}`)} data-sort-id={c.id} onPointerDown={dragCategory} {...menu}>
                      <ModuleChip color={c.color ?? OTHER_COLOR} icon={symbolPath(c.icon, ICONS.star)} size={22} />
                      <span className="budget-limit-text">
                        <span className="budget-limit-name">{c.name}</span>
                      </span>
                      <span className="budget-limit-amount budget-income-amount">{received ? `+ ${formatAmount(received)}` : "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="glass budget-card" aria-label={tr("Six derniers mois")}>
            <h2 className="budget-panel-title">{tr("Six derniers mois")}</h2>
            <BarChart
              data={past.map((p) => ({ label: shortMonthLabel(p.month), value: p.spent, second: p.income, current: p.month === month }))}
              format={formatAmount}
              series={[tr("Dépenses"), tr("Revenus")]}
              label={tr("Dépenses et revenus des six derniers mois")}
              color={m.color}
              height={120}
            />
          </section>
        </aside>
      </div>

      {dialog && (
        <TransactionDialog
          key={dialog.transaction?.id ?? "nouvelle"}
          transaction={dialog.transaction}
          kind={dialog.kind}
          onClose={() => setDialog(null)}
          onSeries={(source) => setDialog({ transaction: source, kind: source.kind })}
        />
      )}
      {categoryEdit && <CategoryDialog category={categoryEdit.category} kind={categoryEdit.kind} onClose={() => setCategoryEdit(null)} />}
    </div>
  );
}
