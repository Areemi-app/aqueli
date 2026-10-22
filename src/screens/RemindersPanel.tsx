import { useEffect, useState } from "react";
import { autostart, readBackgroundPrefs, testNotification, writeBackgroundPrefs, type AutostartStatus } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { SelectRow, type SelectOption } from "../components/SelectRow";
import { useNavigation } from "../navigation/NavigationProvider";
import { offsetLabel, readReminderSettings } from "../obligations/obligationReminders";
import { requestObligation } from "../obligations/obligationRequest";
import { SwitchRow } from "../components/Switch";
import { readDefaultReminder, writeDefaultReminder } from "../tasks/reminderPrefs";
import { BIRTHDAY_REMINDER_CHOICES, readBirthdayReminder, writeBirthdayReminder, type BirthdayReminder } from "../contacts/birthdayReminders";
import { JOURNAL_REMINDER_TIMES, readJournalReminder, writeJournalReminder } from "../journal/journalReminder";
import { readKeepReminder, writeKeepReminder } from "../contacts/keepInTouchReminders";
import { reminderChoices, reminderLabel } from "../tasks/reminders";
import { tr, trn } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

const DEFAULT_OPTIONS: SelectOption<string>[] = [
  { value: "", label: tr("Aucun") },
  ...reminderChoices(true).map((m) => ({ value: String(m), label: reminderLabel(m, true) })),
];

/** Paramètres › Rappels : arrière-plan, démarrage de Windows, contenu des notifications. */
export function RemindersPanel() {
  const notify = useToast();
  const [prefs, setPrefs] = useState(readBackgroundPrefs);
  const [start, setStart] = useState<AutostartStatus | null>(null);
  const [defaultReminder, setDefaultReminder] = useState(readDefaultReminder);
  const [birthday, setBirthday] = useState<BirthdayReminder>(readBirthdayReminder);
  const [journal, setJournal] = useState(readJournalReminder);
  const [keep, setKeep] = useState(readKeepReminder);
  const { go } = useNavigation();
  const [obligationReminders] = useState(readReminderSettings);
  const exceptions = Object.keys(obligationReminders.categories).length;
  const obligationSummary =
    (obligationReminders.default.length === 0 ? tr("Aucun rappel") : obligationReminders.default.map(offsetLabel).join(", ")) +
    "." +
    (exceptions === 0 ? "" : ` ${trn(exceptions, "Réglages propres à {n} catégorie.", "Réglages propres à {n} catégories.")}`);

  useEffect(() => {
    autostart
      .get()
      .then(setStart)
      .catch(() => setStart({ supported: false, enabled: false }));
  }, []);

  const change = (next: typeof prefs) => {
    setPrefs(next);
    writeBackgroundPrefs(next);
  };

  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Arrière-plan")}</h2>
      <div className="settings-card glass">
        <SwitchRow
          label={tr("Garder Aqueli en arrière-plan à la fermeture")}
          description={tr("Aqueli se verrouille et reste près de l'horloge. Les rappels continuent d'arriver. « Quitter Aqueli », depuis l'icône, l'arrête.")}
          checked={prefs.keepInBackground}
          onChange={(keepInBackground) => change({ ...prefs, keepInBackground })}
        />
        <SwitchRow
          label={tr("Lancer Aqueli au démarrage de Windows")}
          description={tr("Aqueli démarre verrouillé, sans ouvrir de fenêtre.")}
          checked={start?.enabled ?? false}
          disabled={!start?.supported}
          note={start && !start.supported ? tr("Disponible dans la version installée.") : undefined}
          onChange={(enabled) => {
            autostart
              .set(enabled)
              .then(setStart)
              .catch(() => notify(tr("Réglage de Windows impossible à modifier.")));
          }}
        />
      </div>
      <h2 className="settings-heading">{tr("Notifications")}</h2>
      <div className="settings-card glass">
        <SelectRow
          label={tr("Rappel par défaut")}
          description={tr("Donné aux tâches qui reçoivent une heure et aux nouveaux événements.")}
          value={defaultReminder === null ? "" : String(defaultReminder)}
          options={DEFAULT_OPTIONS}
          onChange={(v) => {
            const minutes = v === "" ? null : Number(v);
            setDefaultReminder(minutes);
            writeDefaultReminder(minutes);
          }}
        />
        <SwitchRow
          label={tr("Afficher le titre des tâches quand Aqueli est verrouillé")}
          description={tr("Sinon, la notification indique seulement « Rappel Aqueli ».")}
          checked={prefs.showTitlesWhenLocked}
          onChange={(showTitlesWhenLocked) => change({ ...prefs, showTitlesWhenLocked })}
        />
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Notification d'essai")}</span>
            <span className="setting-desc">
              {tr("Arrive 20 secondes après le clic. Fermez la fenêtre entre-temps pour essayer « Rappel Aqueli ».")}
            </span>
          </div>
          <button
            type="button"
            className="btn-glass btn-glass--sm"
            onClick={() =>
              testNotification()
                .then(() => notify(tr("Notification d'essai dans 20 secondes.")))
                .catch(() => notify(tr("Notification impossible à programmer.")))
            }
          >
            <Icon d={ICONS.bell} size={15} />
            {tr("Tester")}
          </button>
        </div>
      </div>
      <p className="settings-hint">
        <Sentences text={tr("Les rappels se règlent tâche par tâche, dans le panneau de détail. Ceux manqués pendant qu'Aqueli était arrêté sont signalés au déverrouillage.")} />
      </p>

      <h2 className="settings-heading">{tr("Obligations")}</h2>
      <div className="settings-card glass">
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Rappels des obligations")}</span>
            <span className="setting-desc">{obligationSummary}</span>
          </div>
          <button
            type="button"
            className="btn-glass btn-glass--sm"
            onClick={() => {
              go("obligations");
              requestObligation({ settings: "rappels" });
            }}
          >
            <Icon d={ICONS.settings} size={15} />
            {tr("Régler")}
          </button>
        </div>
      </div>

      <h2 className="settings-heading">{tr("Journal, contacts et documents")}</h2>
      <div className="settings-card glass">
        <SelectRow
          label={tr("Rappel d'écriture")}
          description={tr("Chaque jour, tant que la page du jour n'est pas écrite.")}
          value={journal ?? ""}
          options={[{ value: "", label: tr("Aucun") }, ...JOURNAL_REMINDER_TIMES.map((t) => ({ value: t, label: t }))]}
          onChange={(v) => {
            setJournal(v || null);
            writeJournalReminder(v || null);
          }}
        />
        <SelectRow
          label={tr("Anniversaires")}
          description={tr("Rappel de l'anniversaire de chaque contact.")}
          value={birthday === null ? "" : String(birthday)}
          options={BIRTHDAY_REMINDER_CHOICES.map((c) => ({ value: c.value === null ? "" : String(c.value), label: c.label }))}
          onChange={(v) => {
            const value = (v === "" ? null : Number(v)) as BirthdayReminder;
            setBirthday(value);
            writeBirthdayReminder(value);
          }}
        />
        <SwitchRow
          label={tr("Rester en contact")}
          description={tr("Rappel à 10 h le jour où un contact suivi est à recontacter.")}
          checked={keep}
          onChange={(on) => {
            setKeep(on);
            writeKeepReminder(on);
          }}
        />
      </div>
      <p className="settings-hint">{tr("Le rappel d'expiration d'un document se règle dans son panneau, écran Documents.")}</p>
    </div>
  );
}
