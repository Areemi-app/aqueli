/** Paramètres › Sécurité › Journal de sécurité : les derniers événements, puis la liste complète. */
import { useEffect, useState } from "react";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { describeEvent, securityLog, whenLabel, type SecurityEvent, type SecurityLog } from "./securityLog";
import { tr, trn } from "../i18n/i18n";

/** Événements montrés dans les Paramètres ; les autres sont dans « N de plus ». */
const SHOWN = 6;
/** Liste complète : les 500 derniers. */
const ALL = 500;

function EventRows({ events }: { events: readonly SecurityEvent[] }) {
  return (
    <ul className="security-log">
      {events.map((e) => {
        const view = describeEvent(e);
        return (
          <li key={e.id} className="security-event" data-tone={view.tone ?? undefined}>
            <span className="security-event-icon" aria-hidden="true">
              <Icon d={view.icon} size={15} stroke={2.2} />
            </span>
            <span className="security-event-text">
              <span className="security-event-label">{view.label}</span>
              {view.detail && <span className="security-event-detail">{view.detail}</span>}
            </span>
            <time className="security-event-when" dateTime={new Date(e.at * 1000).toISOString()}>
              {whenLabel(e.at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

export function SecurityLogSection() {
  const [log, setLog] = useState<SecurityLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState<SecurityLog | null>(null);

  useEffect(() => {
    securityLog(SHOWN)
      .then(setLog)
      .catch((err) => setError(dataErrorMessage(err as DataError)));
  }, []);

  const openAll = () => {
    securityLog(ALL)
      .then(setAll)
      .catch((err) => setError(dataErrorMessage(err as DataError)));
  };

  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Journal de sécurité")}</h2>
      <div className="settings-card settings-card--padded glass">
        <p className="settings-intro">{tr("Déverrouillages, essais erronés, exports et changements de mot de passe, enregistrés sur ce PC.")}</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {log && log.events.length === 0 && <p className="settings-intro">{tr("Aucun événement.")}</p>}
        {log && log.events.length > 0 && <EventRows events={log.events} />}
        {log && log.total > log.events.length && (
          <div>
            <button type="button" className="btn-glass btn-glass--sm" onClick={openAll}>
              {tr("{n} de plus", { n: log.total - log.events.length })}
            </button>
          </div>
        )}
      </div>
      {all && (
        <Dialog title={tr("Journal de sécurité")} className="dialog--security-log" onClose={() => setAll(null)}>
          <EventRows events={all.events} />
          {all.total > all.events.length && <p className="settings-hint">{trn(all.events.length, "Le {n} événement le plus récent est affiché.", "Les {n} événements les plus récents sont affichés.")}</p>}
        </Dialog>
      )}
    </div>
  );
}
