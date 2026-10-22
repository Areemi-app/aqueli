import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { LinksSection } from "../links/LinksSection";
import { Dialog } from "../components/Dialog";
import { MoreOptions } from "../components/MoreOptions";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select } from "../components/SelectRow";
import { SwitchRow } from "../components/Switch";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useSpaces } from "../spaces/SpacesProvider";
import { TASK_COLORS } from "../tasks/colors";
import { sameRecurrence } from "../tasks/recurrence";
import { RecurrenceField } from "../tasks/RecurrenceField";
import { reminderChoices, reminderLabel } from "../tasks/reminders";
import type { CalendarEvent, EventInput } from "./events";
import { toEventInput } from "./events";
import { useEvents } from "./EventsProvider";
import { isOrdered, moveStart, toggleAllDay } from "./eventTime";
import { occurrenceOf } from "./occurrences";
import { applyToSeries, detachedEvent, withoutOccurrence, type SeriesScope } from "./series";
import { SeriesScopeDialog } from "./SeriesScopeDialog";
import { DateField } from "../components/DateField";
import { TimeField } from "../components/TimeField";
import { tr } from "../i18n/i18n";

type EventEditorProps = (
  | {
      /** Événement modifié. */
      event: CalendarEvent;
      /** Événement répété : jour de l'occurrence ouverte. */
      occurrence?: string | null;
      draft?: undefined;
    }
  | { event?: undefined; occurrence?: undefined; /** Valeurs de départ d'un nouvel événement (créneau glissé…). */ draft: EventInput }
) & { onClose: () => void };

/** Fenêtre « Nouvel événement » / « Modifier l'événement ». */
export function EventEditor({ event, occurrence, draft, onClose }: EventEditorProps) {
  const { create, update, remove } = useEvents();
  const { spaces } = useSpaces();
  // Occurrence d'une série : ses propres dates sont affichées.
  const [form, setForm] = useState<EventInput>(() =>
    event ? { ...toEventInput(event), ...(occurrence ? occurrenceOf(event, occurrence) : {}) } : draft!,
  );
  const [asking, setAsking] = useState<"modifier" | "supprimer" | null>(null);
  const series = event?.recurrence && occurrence ? event : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const allDay = form.startTime === null;
  const change = (changes: Partial<EventInput>) => {
    setForm((f) => ({ ...f, ...changes }));
    setError(null);
  };
  const spaceColor = spaces.find((s) => s.id === form.spaceId)?.color;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError(tr("Saisissez un titre."));
      return;
    }
    if (!isOrdered(form)) {
      setError(allDay ? tr("La date de fin doit suivre la date de début.") : tr("La fin doit être après le début."));
      return;
    }
    if (series) {
      setAsking("modifier");
      return;
    }
    await save(null);
  };

  /** Enregistre ; pour une occurrence de série, selon la portée choisie. */
  const save = async (scope: SeriesScope | null) => {
    setBusy(true);
    try {
      if (!event) await create(form);
      else if (!series || !occurrence) await update(event, form);
      else if (scope === "one") {
        await update(series, withoutOccurrence(series, occurrence));
        await create(detachedEvent(series, form));
      } else {
        // Toute la série : les dates suivent le changement fait sur cette occurrence ; une
        // règle ou une fin de série modifiées dans la fenêtre sont gardées telles quelles.
        const shifted = applyToSeries(series, occurrence, form);
        await update(series, {
          ...form,
          ...shifted,
          recurrence: sameRecurrence(form.recurrence, series.recurrence) ? (shifted.recurrence ?? null) : form.recurrence,
          repeatUntil: form.repeatUntil === series.repeatUntil ? (shifted.repeatUntil ?? null) : form.repeatUntil,
        });
      }
      onClose();
    } catch (err) {
      setError(dataErrorMessage(err as DataError));
      setBusy(false);
    }
  };

  const removeWith = (scope: SeriesScope) => {
    if (series && occurrence && scope === "one") void update(series, withoutOccurrence(series, occurrence));
    else if (event) void remove(event);
    onClose();
  };
  const reminderOptions = [
    { value: "", label: tr("Aucun") },
    ...reminderChoices(!allDay).map((m) => ({ value: String(m), label: reminderLabel(m, !allDay) })),
    ...(form.reminder !== null && !reminderChoices(!allDay).includes(form.reminder)
      ? [{ value: String(form.reminder), label: reminderLabel(form.reminder, !allDay) }]
      : []),
  ];

  const spaceOptions = [
    ...(form.spaceId === null ? [{ value: "", label: tr("Aucun") }] : []),
    ...spaces.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <Dialog title={event ? tr("Modifier l'événement") : tr("Nouvel événement")} onClose={onClose} className="dialog--event">
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
              onChange={(e) => change({ title: e.target.value })}
            />
          </div>
        </div>

        <SwitchRow label={tr("Journée entière")} checked={allDay} onChange={(on) => change(toggleAllDay(form, on))} />

        <div className="event-when">
          <span className="field-label" id={`${ids}-debut`}>
            {tr("Début")}
          </span>
          <div className="event-when-inputs" role="group" aria-labelledby={`${ids}-debut`}>
            <DateField className="detail-input" label={tr("Date de début")} value={form.startDate} onChange={(v) => v && change(moveStart(form, v, form.startTime))} />
            {!allDay && (
              <TimeField
                className="detail-input detail-input--time"
                label={tr("Heure de début")}
                value={form.startTime}
                onChange={(v) => v && change(moveStart(form, form.startDate, v))}
              />
            )}
          </div>
          <span className="field-label" id={`${ids}-fin`}>
            {tr("Fin")}
          </span>
          <div className="event-when-inputs" role="group" aria-labelledby={`${ids}-fin`}>
            <DateField className="detail-input" label={tr("Date de fin")} value={form.endDate} min={form.startDate} onChange={(v) => v && change({ endDate: v })} />
            {!allDay && (
              <TimeField
                className="detail-input detail-input--time"
                label={tr("Heure de fin")}
                value={form.endTime}
                from={form.endDate === form.startDate ? form.startTime : null}
                onChange={(v) => v && change({ endTime: v })}
              />
            )}
          </div>
        </div>

        <div className="event-row">
          <label htmlFor={`${ids}-calendrier`} className="field-label">
            {tr("Calendrier")}
          </label>
          <Select
            id={`${ids}-calendrier`}
            value={form.spaceId ?? ""}
            options={spaceOptions}
            onChange={(v) => change({ spaceId: v || null })}
          />
        </div>

        <div className="event-row">
          <label htmlFor={`${ids}-repetition`} className="field-label">
            {tr("Répétition")}
          </label>
          <RecurrenceField
            id={`${ids}-repetition`}
            value={form.recurrence}
            base={form.startDate}
            allowAfterDone={false}
            onChange={(recurrence) => change({ recurrence, repeatUntil: recurrence ? form.repeatUntil : null })}
          />
        </div>
        {form.recurrence && (
          <div className="event-row">
            <label htmlFor={`${ids}-fin-serie`} className="field-label">
              {tr("Fin de la répétition")}
            </label>
            <div className="event-when-inputs">
              <DateField
                id={`${ids}-fin-serie`}
                className="detail-input"
                clearable
                placeholder={tr("Sans fin")}
                min={form.startDate}
                value={form.repeatUntil}
                onChange={(v) => change({ repeatUntil: v || null })}
              />
              {form.repeatUntil && (
                <button type="button" className="link-btn" onClick={() => change({ repeatUntil: null })}>
                  {tr("Sans fin")}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="event-row">
          <label htmlFor={`${ids}-rappel`} className="field-label">
            {tr("Rappel")}
          </label>
          <Select
            id={`${ids}-rappel`}
            value={form.reminder === null ? "" : String(form.reminder)}
            options={reminderOptions}
            onChange={(v) => change({ reminder: v === "" ? null : Number(v) })}
          />
        </div>

        <div className="field">
          <label htmlFor={`${ids}-lieu`} className="field-label">
            {tr("Lieu")}
          </label>
          <div className="field-box">
            <input
              id={`${ids}-lieu`}
              className="field-input"
              value={form.location}
              maxLength={300}
              autoComplete="off"
              onChange={(e) => change({ location: e.target.value })}
            />
          </div>
        </div>

        <MoreOptions open={!!event && (event.color !== null || !!event.notes)}>
          <div className="event-colors">
            <span className="field-label" id={`${ids}-couleur`}>
              {tr("Couleur")}
            </span>
            <div className="color-choices" role="radiogroup" aria-labelledby={`${ids}-couleur`}>
              <button
                type="button"
                role="radio"
                aria-checked={form.color === null}
                className={spaceColor ? "color-choice" : "color-choice color-choice--theme"}
                style={spaceColor ? ({ "--swatch": spaceColor } as CSSProperties) : undefined}
                title={tr("Couleur du calendrier")}
                aria-label={tr("Couleur du calendrier")}
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

        {event && <LinksSection item={{ kind: "event", id: event.id }} kinds={["contact", "document", "note", "task", "project", "obligation"]} />}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="event-actions">
          {event && (
            <button
              type="button"
              className="btn-glass event-delete"
              onClick={() => (series ? setAsking("supprimer") : removeWith("all"))}
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
            {event ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
      {asking && (
        <SeriesScopeDialog
          action={asking}
          onClose={() => setAsking(null)}
          onChoose={(scope) => (asking === "supprimer" ? removeWith(scope) : void save(scope))}
        />
      )}
    </Dialog>
  );
}
