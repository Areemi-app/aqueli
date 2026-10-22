/** Paramètres › Calendrier › Affichage du calendrier : heures de travail, nouveaux événements, semaines. */
import { useId } from "react";
import { SelectRow } from "../components/SelectRow";
import { SwitchRow } from "../components/Switch";
import { TimeField } from "../components/TimeField";
import { DURATIONS, EVENT_REMINDERS, setCalendarSettings, useCalendarSettings } from "./calendarSettings";
import { tr } from "../i18n/i18n";

export function CalendarDisplaySettings() {
  const cal = useCalendarSettings();
  const ids = useId();
  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Affichage du calendrier")}</h2>
      <div className="settings-card glass">
        <div className="setting-row">
          <div className="setting-text">
            <span id={`${ids}-heures`} className="setting-label">
              {tr("Heures de travail")}
            </span>
            <span className="setting-desc">{tr("Le reste de la journée est grisé dans les vues Jour et Semaine, qui s'ouvrent au début de la journée.")}</span>
          </div>
          <div className="work-hours" role="group" aria-labelledby={`${ids}-heures`}>
            <TimeField
              className="detail-input detail-input--time"
              label={tr("Début de la journée de travail")}
              value={cal.workStart}
              disabled={!cal.showWorkHours}
              onChange={(v) => v && v < cal.workEnd && setCalendarSettings({ workStart: v })}
            />
            <span className="setting-desc">à</span>
            <TimeField
              className="detail-input detail-input--time"
              label={tr("Fin de la journée de travail")}
              value={cal.workEnd}
              from={cal.workStart}
              disabled={!cal.showWorkHours}
              onChange={(v) => v && v > cal.workStart && setCalendarSettings({ workEnd: v })}
            />
          </div>
        </div>
        <SwitchRow label={tr("Griser les heures en dehors du travail")} checked={cal.showWorkHours} onChange={(showWorkHours) => setCalendarSettings({ showWorkHours })} />
        <SelectRow
          label={tr("Durée d'un nouvel événement")}
          description={tr("Aussi pour un événement créé d'un double-clic ou en une phrase.")}
          value={String(cal.defaultDuration)}
          options={DURATIONS.map((d) => ({ value: String(d.value), label: d.label }))}
          onChange={(v) => setCalendarSettings({ defaultDuration: Number(v) })}
        />
        <SelectRow
          label={tr("Rappel d'un nouvel événement")}
          value={String(cal.eventReminder)}
          options={EVENT_REMINDERS.map((r) => ({ value: String(r.value), label: r.label }))}
          onChange={(v) => setCalendarSettings({ eventReminder: v === "null" ? null : Number(v) })}
        />
        <SwitchRow label={tr("Afficher les numéros de semaine")} checked={cal.weekNumbers} onChange={(weekNumbers) => setCalendarSettings({ weekNumbers })} />
        <SwitchRow
          label={tr("Afficher le samedi et le dimanche")}
          description={tr("Dans la vue Semaine.")}
          checked={cal.weekends}
          onChange={(weekends) => setCalendarSettings({ weekends })}
        />
      </div>
    </div>
  );
}
