import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";
import { Checkbox } from "../components/Checkbox";
import { MoreOptions } from "../components/MoreOptions";
import { dayKey, formatShortDay } from "../tasks/day";
import { obligationsApi } from "./api";
import { LinksSection } from "../links/LinksSection";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select } from "../components/SelectRow";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useSpaces } from "../spaces/SpacesProvider";
import { TASK_COLORS } from "../tasks/colors";
import {
  PERIODS,
  STATUS_LABELS,
  formatAmount,
  paidInYear,
  parseAmount,
  type Payment,
  toObligationInput,
  type Obligation,
  type ObligationCategory,
  type ObligationInput,
  type ObligationStatus,
} from "./obligations";
import { useObligations } from "./ObligationsProvider";
import { DateField } from "../components/DateField";
import { tr } from "../i18n/i18n";

type ObligationEditorProps = ({ obligation: Obligation; draft?: undefined } | { obligation?: undefined; draft: ObligationInput }) & {
  onClose: () => void;
};

const STATUSES: ObligationStatus[] = ["a-faire", "paye", "resilie"];

/** « 45,90 » : montant en centimes affiché dans le champ. */
const amountText = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

/** Paiements enregistrés de l'obligation (« Payé » ou prélèvements automatiques), avec le total de l'année. */
function PaymentHistory({ obligation }: { obligation: Obligation }) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  useEffect(() => {
    let alive = true;
    obligationsApi
      .payments(obligation.id)
      .then((list) => alive && setPayments(list))
      .catch(() => alive && setPayments([]));
    return () => {
      alive = false;
    };
  }, [obligation.id, obligation.lastPaidOn]);
  if (!payments) return null;
  const today = dayKey(new Date());
  const year = today.slice(0, 4);
  return (
    <section className="obl-history" aria-label={tr("Paiements")}>
      <div className="obl-history-head">
        <span className="field-label">{tr("Paiements")}</span>
        {payments.length > 0 && <span className="obl-history-total">{tr("Payé en {year} : {amount}", { year, amount: formatAmount(paidInYear(payments, year)) })}</span>}
      </div>
      {payments.length === 0 ? (
        <p className="obl-history-empty">{tr("Aucun paiement enregistré.")}</p>
      ) : (
        <ul className="obl-history-list">
          {payments.map((p) => (
            <li key={p.id} className="obl-history-row">
              <span className="obl-history-day">{formatShortDay(p.paidOn, today)}</span>
              <span className="obl-history-kind">{p.auto ? tr("Prélevé") : tr("Payé")}</span>
              <span className="obl-history-amount">{p.amountCents === null ? "—" : formatAmount(p.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Fenêtre « Nouvelle obligation » / « Modifier l'obligation ». */
export function ObligationEditor({ obligation, draft, onClose }: ObligationEditorProps) {
  const { create, update, remove, categories, categoryOf } = useObligations();
  const { spaces } = useSpaces();
  const [form, setForm] = useState<ObligationInput>(() => (obligation ? toObligationInput(obligation) : draft!));
  const [amount, setAmount] = useState(() => amountText(form.amountCents));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const category = categoryOf(form.category);
  const change = (changes: Partial<ObligationInput>) => {
    setForm((f) => ({ ...f, ...changes }));
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmount(amount);
    if (!form.title.trim()) return setError(tr("Saisissez un titre."));
    if (Number.isNaN(cents)) return setError(tr("Montant non valide."));
    if (form.cancelBy && form.cancelBy > form.dueDate) return setError(tr("La date limite de résiliation doit précéder l'échéance."));
    const input = { ...form, amountCents: cents };
    setBusy(true);
    try {
      if (obligation) await update(obligation, input);
      else await create(input);
      onClose();
    } catch (err) {
      setError(dataErrorMessage(err as DataError));
      setBusy(false);
    }
  };

  const cents = parseAmount(amount);
  const yearly = form.periodMonths && cents !== null && !Number.isNaN(cents) && cents > 0 ? Math.round((cents * 12) / form.periodMonths) : null;
  // Réglages secondaires ouverts d'emblée quand l'obligation en a déjà.
  const [moreOpen] = useState(
    () => !!obligation && (!!obligation.organization || !!obligation.reference || !!obligation.cancelBy || obligation.status !== "a-faire" || !!obligation.color || !!obligation.notes),
  );

  const spaceOptions = [
    ...(form.spaceId === null ? [{ value: "", label: tr("Aucun") }] : []),
    ...spaces.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <Dialog title={obligation ? tr("Modifier l'obligation") : tr("Nouvelle obligation")} onClose={onClose} className="dialog--event">
      <form className="event-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${ids}-titre`} className="field-label">
            {tr("Titre")}
          </label>
          <div className="field-box" data-invalid={error === tr("Saisissez un titre.") || undefined}>
            <input
              id={`${ids}-titre`}
              className="field-input"
              value={form.title}
              maxLength={500}
              autoComplete="off"
              placeholder={tr("Assurance habitation, loyer, passeport…")}
              onChange={(e) => change({ title: e.target.value })}
            />
          </div>
        </div>

        <div className="event-row">
          <label htmlFor={`${ids}-categorie`} className="field-label">
            {tr("Catégorie")}
          </label>
          <Select
            id={`${ids}-categorie`}
            value={form.category}
            options={categories.map((c) => ({ value: c.id, label: c.label }))}
            onChange={(v) => change({ category: v as ObligationCategory })}
          />
        </div>

        <div className="obl-pair">
          <div className="field">
            <label htmlFor={`${ids}-montant`} className="field-label">
              {tr("Montant")}
            </label>
            <div className="field-box" data-invalid={error === tr("Montant non valide.") || undefined}>
              <input
                id={`${ids}-montant`}
                className="field-input obl-amount-input"
                value={amount}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
              />
              <span className="obl-currency" aria-hidden="true">
                €
              </span>
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${ids}-periodicite`} className="field-label">
              {tr("Périodicité")}
            </label>
            <Select
              id={`${ids}-periodicite`}
              value={form.periodMonths === null ? "" : String(form.periodMonths)}
              options={PERIODS.map((p) => ({ value: p.value === null ? "" : String(p.value), label: p.label }))}
              onChange={(v) => change({ periodMonths: v === "" ? null : Number(v) })}
            />
          </div>
        </div>

        {yearly !== null && <p className="obl-yearly">{tr("Soit {amount} par an.", { amount: formatAmount(yearly) })}</p>}

        <div className="obl-pair obl-pair--due">
          <div className="field">
            <label htmlFor={`${ids}-echeance`} className="field-label">
              {form.periodMonths === null ? tr("Échéance") : tr("Prochaine échéance")}
            </label>
            <DateField id={`${ids}-echeance`} className="detail-input obl-date" value={form.dueDate} onChange={(v) => v && change({ dueDate: v })} />
          </div>
          <div className="obl-autopay">
            <Checkbox
              checked={form.autoPay}
              onChange={(autoPay) => change({ autoPay })}
              label={tr("Prélèvement automatique")}
              note={tr("Payée d'elle-même à chaque échéance.")}
            />
          </div>
        </div>

        <MoreOptions open={moreOpen}>
          <div className="obl-pair">
            <div className="field">
              <label htmlFor={`${ids}-organisme`} className="field-label">
                {tr("Organisme")}
              </label>
              <div className="field-box">
                <input
                  id={`${ids}-organisme`}
                  className="field-input"
                  value={form.organization}
                  maxLength={200}
                  autoComplete="off"
                  onChange={(e) => change({ organization: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`${ids}-reference`} className="field-label">
                {tr("Référence")}
              </label>
              <div className="field-box">
                <input
                  id={`${ids}-reference`}
                  className="field-input"
                  value={form.reference}
                  maxLength={100}
                  autoComplete="off"
                  onChange={(e) => change({ reference: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${ids}-resiliation`} className="field-label">
              {tr("Date limite de résiliation")}
            </label>
            <DateField
              id={`${ids}-resiliation`}
              className="detail-input obl-date"
              clearable
              max={form.dueDate}
              value={form.cancelBy}
              onChange={(v) => change({ cancelBy: v || null })}
            />
          </div>

          <div className="event-row">
            <span className="field-label" id={`${ids}-statut`}>
              {tr("Statut")}
            </span>
            <div className="obl-status" role="radiogroup" aria-labelledby={`${ids}-statut`}>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={form.status === s}
                  className="pill pill--button"
                  onClick={() => change({ status: s })}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="event-row">
            <label htmlFor={`${ids}-espace`} className="field-label">
              {tr("Espace")}
            </label>
            <Select id={`${ids}-espace`} value={form.spaceId ?? ""} options={spaceOptions} onChange={(v) => change({ spaceId: v || null })} />
          </div>

          <div className="event-colors">
            <span className="field-label" id={`${ids}-couleur`}>
              {tr("Couleur")}
            </span>
            <div className="color-choices" role="radiogroup" aria-labelledby={`${ids}-couleur`}>
              <button
                type="button"
                role="radio"
                aria-checked={form.color === null}
                className="color-choice"
                style={{ "--swatch": category.color } as CSSProperties}
                title={tr("Couleur de la catégorie")}
                aria-label={tr("Couleur de la catégorie")}
                onClick={() => change({ color: null })}
              />
              {TASK_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={form.color === c.value}
                  className="color-choice"
                  title={c.label}
                  aria-label={c.label}
                  style={{ "--swatch": c.value } as CSSProperties}
                  onClick={() => change({ color: c.value })}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${ids}-notes`} className="field-label">
              {tr("Notes")}
            </label>
            <textarea
              id={`${ids}-notes`}
              className="event-notes"
              rows={3}
              value={form.notes}
              maxLength={20000}
              onChange={(e) => change({ notes: e.target.value })}
            />
          </div>
        </MoreOptions>

        {obligation && <PaymentHistory obligation={obligation} />}

        {obligation && (
          <LinksSection
            item={{ kind: "obligation", id: obligation.id }}
            kinds={["document", "contact", "note", "task", "project", "event"]}
            title={tr("Documents et éléments liés")}
            action={tr("Joindre")}
          />
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="event-actions">
          {obligation && (
            <button
              type="button"
              className="btn-glass event-delete"
              onClick={() => {
                void remove(obligation);
                onClose();
              }}
            >
              <Icon d={ICONS.trash} size={15} />
              {tr("Supprimer")}
            </button>
          )}
          <span className="event-actions-gap" />
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel" disabled={busy}>
            {obligation ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
