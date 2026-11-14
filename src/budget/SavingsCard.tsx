/**
 * Épargne du Budget : objectifs (montant visé, date facultative), versements et retraits, ce qu'il
 * reste à mettre de côté chaque mois. Carte de la colonne de droite, fenêtre d'un objectif
 * (réglages à gauche, versements à droite) et fenêtre « Mettre de côté » / « Retirer ».
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { useItemMenu } from "../components/ContextMenu";
import { ColorChoices } from "../components/ColorChoices";
import { DateField } from "../components/DateField";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Select } from "../components/SelectRow";
import { SymbolPicker } from "../components/SymbolPicker";
import { symbolPath } from "../components/symbols";
import { moved, startDrag } from "../lib/dragDrop";
import { KEYS } from "../lib/itemKeys";
import { NEW_ITEM, savingsRequest } from "../lib/request";
import { useNow } from "../lib/useNow";
import { formatAmount, parseAmount } from "../obligations/obligations";
import { useSpaces } from "../spaces/SpacesProvider";
import { dayKey, formatShortDay, fromDayKey } from "../tasks/day";
import { useBudget } from "./BudgetProvider";
import { savingsProgress, savingsStatus, type SavingsGoal, type SavingsGoalInput } from "./savings";
import { locale, tr } from "../i18n/i18n";

const DEFAULT_COLOR = "#2fae4a";
/** Signe moins d'un retrait. */
const MINUS = "M5 12h14";

const longDate = (day: string) => new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric" }).format(fromDayKey(day));

/** « 200 € par mois jusqu'au 1 juillet 2027 », « Objectif atteint »… */
export function savingsLine(g: SavingsGoal, today: string): string {
  const s = savingsStatus(g, today);
  if (s.kind === "atteint") return tr("Objectif atteint");
  if (s.kind === "depasse") return tr("Date dépassée · reste {amount}", { amount: formatAmount(s.remainingCents) });
  if (s.kind === "libre") return tr("Reste {amount}", { amount: formatAmount(s.remainingCents) });
  return tr("{amount} par mois jusqu'au {date}", { amount: formatAmount(s.perMonthCents), date: longDate(g.targetDate!) });
}

// ——— Versement ou retrait ———

function EntryDialog({ goal, withdraw, onClose }: { goal: SavingsGoal; withdraw: boolean; onClose: () => void }) {
  const { addSavingsEntry } = useBudget();
  const today = dayKey(useNow());
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmount(amount);
    if (!cents || Number.isNaN(cents) || cents <= 0) {
      setError(tr("Saisissez un montant."));
      return;
    }
    await addSavingsEntry(goal, { day, amountCents: withdraw ? -cents : cents, note: note.trim() });
    onClose();
  };
  return (
    <Dialog title={withdraw ? tr("Retirer · {name}", { name: goal.name }) : tr("Mettre de côté · {name}", { name: goal.name })} onClose={onClose}>
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="budget-form-row">
          <div className="field">
            <label htmlFor={`${ids}-montant`} className="field-label">
              {tr("Montant")}
            </label>
            <div className="field-box" data-invalid={error ? true : undefined}>
              <input id={`${ids}-montant`} className="field-input" inputMode="decimal" placeholder="0,00 €" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${ids}-date`} className="field-label">
              {tr("Date")}
            </label>
            <div className="field-box">
              <DateField id={`${ids}-date`} className="field-input" value={day} onChange={(v) => v && setDay(v)} />
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-note`} className="field-label">
            {tr("Note")}
          </label>
          <div className="field-box">
            <input id={`${ids}-note`} className="field-input" maxLength={200} placeholder={withdraw ? tr("Réparation, imprévu…") : tr("Prime, reste du mois…")} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
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
            {withdraw ? tr("Retirer|argent") : tr("Mettre de côté")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ——— Objectif : réglages et versements ———

function GoalDialog({ goal, onClose, onEntry }: { goal?: SavingsGoal; onClose: () => void; onEntry: (g: SavingsGoal, withdraw: boolean) => void }) {
  const { createSavings, updateSavings, savingsEntries, removeSavingsEntry } = useBudget();
  const { spaces, filter } = useSpaces();
  const today = dayKey(useNow());
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? (goal.targetCents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "") : "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [icon, setIcon] = useState(goal?.icon ?? "tirelire");
  const [color, setColor] = useState<string | null>(goal?.color ?? DEFAULT_COLOR);
  const [spaceId, setSpaceId] = useState(goal?.spaceId ?? (filter !== "tous" ? filter : ""));
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const entries = goal ? savingsEntries.filter((e) => e.goalId === goal.id) : [];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(tr("Saisissez un nom."));
      return;
    }
    const cents = parseAmount(target);
    if (!cents || Number.isNaN(cents) || cents <= 0) {
      setError(tr("Saisissez le montant à atteindre."));
      return;
    }
    const input: SavingsGoalInput = { name: name.trim(), targetCents: cents, targetDate: targetDate || null, icon, color, spaceId: spaceId || null };
    if (goal) await updateSavings(goal, input);
    else await createSavings(input);
    onClose();
  };
  const settings = (
    <>
      <div className="field">
        <label htmlFor={`${ids}-nom`} className="field-label">
          {tr("Nom")}
        </label>
        <div className="field-box" data-invalid={error === tr("Saisissez un nom.") || undefined}>
          <input id={`${ids}-nom`} className="field-input" maxLength={120} placeholder={tr("Vacances, apport, coussin de sécurité…")} value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        </div>
      </div>
      <div className="budget-form-row">
        <div className="field">
          <label htmlFor={`${ids}-montant`} className="field-label">
            {tr("Montant à atteindre")}
          </label>
          <div className="field-box" data-invalid={error === tr("Saisissez le montant à atteindre.") || undefined}>
            <input id={`${ids}-montant`} className="field-input" inputMode="decimal" placeholder="0 €" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-date`} className="field-label">
            {tr("Date visée")}
          </label>
          <div className="field-box">
            <DateField id={`${ids}-date`} className="field-input" value={targetDate} min={goal ? undefined : today} clearable placeholder={tr("Aucune date")} onChange={(v) => setTargetDate(v ?? "")} />
          </div>
        </div>
      </div>
      <div className="field">
        <span className="field-label">{tr("Symbole")}</span>
        <SymbolPicker value={icon} onChange={setIcon} label={tr("Symbole de l'objectif")} color={color} />
      </div>
      <div className="field">
        <span className="field-label">{tr("Couleur")}</span>
        <ColorChoices value={color} onChange={setColor} label={tr("Couleur de l'objectif")} />
      </div>
      <div className="field">
        <label htmlFor={`${ids}-espace`} className="field-label">
          {tr("Espace")}
        </label>
        <Select id={`${ids}-espace`} value={spaceId} options={[{ value: "", label: tr("Tous les espaces") }, ...spaces.map((s) => ({ value: s.id, label: s.name }))]} onChange={setSpaceId} />
      </div>
    </>
  );
  return (
    <Dialog title={goal ? goal.name : tr("Nouvel objectif d'épargne")} onClose={onClose} className={goal ? "dialog--savings" : undefined}>
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        {goal ? (
          <div className="savings-dialog-grid">
            <div className="savings-dialog-col">{settings}</div>
            <section className="savings-dialog-col savings-history" aria-label={tr("Versements")} style={{ "--row-color": goal.color ?? DEFAULT_COLOR } as CSSProperties}>
              <div className="savings-summary">
                <strong>{formatAmount(goal.savedCents)}</strong>
                <span>{tr("sur {amount}", { amount: formatAmount(goal.targetCents) })}</span>
              </div>
              <span className="budget-limit-bar" data-done={savingsProgress(goal) >= 1 || undefined}>
                <span style={{ width: `${savingsProgress(goal) * 100}%` }} />
              </span>
              <p className="savings-line">{savingsLine(goal, today)}</p>
              <div className="savings-actions">
                <button type="button" className="btn-money" data-kind="revenu" onClick={() => onEntry(goal, false)}>
                  <Icon d={ICONS.plus} size={15} stroke={3} />
                  {tr("Mettre de côté")}
                </button>
                <button type="button" className="btn-money" data-kind="depense" onClick={() => onEntry(goal, true)}>
                  <Icon d={MINUS} size={15} stroke={3} />
                  {tr("Retirer|argent")}
                </button>
              </div>
              <h3 className="savings-history-title">{tr("Versements")}</h3>
              {entries.length === 0 ? (
                <p className="savings-empty">{tr("Aucun versement.")}</p>
              ) : (
                <ul className="savings-entries">
                  {entries.map((e) => (
                    <li key={e.id} data-kind={e.amountCents < 0 ? "retrait" : "versement"}>
                      <span className="savings-entry-day">{formatShortDay(e.day, today)}</span>
                      <span className="savings-entry-note">{e.note}</span>
                      <strong className="savings-entry-amount">{`${e.amountCents < 0 ? "−" : "+"} ${formatAmount(Math.abs(e.amountCents))}`}</strong>
                      <button type="button" className="icon-btn icon-btn--xs" aria-label={tr("Supprimer ce versement")} title={tr("Supprimer ce versement")} onClick={() => void removeSavingsEntry(e)}>
                        <Icon d={ICONS.close} size={11} stroke={2.6} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          settings
        )}
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
            {goal ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ——— Carte de la colonne de droite ———

export function SavingsCard() {
  const { savings, removeSavings, reorderSavings } = useBudget();
  const itemMenu = useItemMenu();
  const today = dayKey(useNow());
  const [pending] = useState(savingsRequest.take);
  const [edit, setEdit] = useState<{ goal?: SavingsGoal } | null>(() => (pending === NEW_ITEM ? {} : null));
  const [entry, setEntry] = useState<{ goal: SavingsGoal; withdraw: boolean } | null>(null);
  // Objectif demandé par la recherche globale ou la palette, ouvert dès qu'il est chargé.
  const waiting = useRef(pending && pending !== NEW_ITEM ? pending : null);
  useEffect(() => {
    const open = (id: string) => {
      if (id === NEW_ITEM) return setEdit({});
      const g = savings.find((x) => x.id === id);
      if (g) setEdit({ goal: g });
    };
    const asked = waiting.current && savings.find((x) => x.id === waiting.current);
    if (asked) {
      waiting.current = null;
      setEdit({ goal: asked });
    }
    return savingsRequest.on(open);
  }, [savings]);
  // La fenêtre ouverte suit l'objectif (versements, somme).
  const editing = edit?.goal ? (savings.find((x) => x.id === edit.goal!.id) ?? edit.goal) : undefined;

  return (
    <section className="glass budget-card" aria-label={tr("Épargne")}>
      <div className="budget-card-head">
        <h2 className="budget-panel-title">{tr("Épargne")}</h2>
        <button type="button" className="link-btn" onClick={() => setEdit({})}>
          <Icon d={ICONS.plus} size={12} stroke={2.6} />
          {tr("Objectif")}
        </button>
      </div>
      {savings.length === 0 ? (
        <div className="savings-card-empty">
          <p>{tr("Aucun objectif d'épargne.")}</p>
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => setEdit({})}>
            {tr("Nouvel objectif d'épargne")}
          </button>
        </div>
      ) : (
        <ul className="budget-limits" data-sort="epargne">
          {savings.map((g, i) => {
            const color = g.color ?? DEFAULT_COLOR;
            const progress = savingsProgress(g);
            const menu = itemMenu(() => [
              { label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: () => setEdit({ goal: g }) },
              { label: tr("Mettre de côté…"), icon: ICONS.plus, run: () => setEntry({ goal: g, withdraw: false }) },
              { label: tr("Retirer…"), icon: MINUS, run: () => setEntry({ goal: g, withdraw: true }) },
              { label: tr("Modifier…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setEdit({ goal: g }) },
              "separator",
              { label: tr("Monter"), icon: ICONS.arrowUp, disabled: i === 0, run: () => void reorderSavings(moved(savings.map((x) => x.id), i, -1)) },
              { label: tr("Descendre"), icon: ICONS.arrowDown, disabled: i === savings.length - 1, run: () => void reorderSavings(moved(savings.map((x) => x.id), i, 1)) },
              "separator",
              { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void removeSavings(g) },
            ]);
            const drag = (e: PointerEvent<HTMLElement>) =>
              startDrag(e, { kind: "epargne", ids: [g.id], label: g.name, color }, { sort: { group: "epargne", onSort: (ids) => void reorderSavings(ids) } });
            return (
              <li key={g.id} style={{ "--row-color": color } as CSSProperties}>
                <button type="button" className="budget-limit budget-saving" data-sort-id={g.id} onPointerDown={drag} onClick={() => setEdit({ goal: g })} {...menu}>
                  <ModuleChip color={color} icon={symbolPath(g.icon, ICONS.star)} size={22} />
                  <span className="budget-limit-text">
                    <span className="budget-limit-name">{g.name}</span>
                    <span className="budget-limit-bar" data-done={progress >= 1 || undefined}>
                      <span style={{ width: `${progress * 100}%` }} />
                    </span>
                    <span className="budget-saving-line">{savingsLine(g, today)}</span>
                  </span>
                  <span className="budget-limit-amount">
                    {formatAmount(g.savedCents)}
                    <small> / {formatAmount(g.targetCents)}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* Les fenêtres s'ouvrent devant tout l'écran : le verre de la carte les enfermerait. */}
      {edit && createPortal(<GoalDialog key={editing?.id ?? "nouveau"} goal={editing} onClose={() => setEdit(null)} onEntry={(goal, withdraw) => setEntry({ goal, withdraw })} />, document.body)}
      {entry && createPortal(<EntryDialog goal={entry.goal} withdraw={entry.withdraw} onClose={() => setEntry(null)} />, document.body)}
    </section>
  );
}
