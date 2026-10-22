/**
 * Paramètres › Clavier : raccourci de la capture rapide, puis tous les raccourcis, groupés par
 * endroit. Ceux propres à Aqueli se modifient ; ceux de Windows et de la saisie restent fixes.
 */
import { useEffect, useState, type KeyboardEvent } from "react";
import {
  COMMANDS,
  comboFromEvent,
  comboKeys,
  comboProblem,
  comboText,
  DEFAULT_SHORTCUTS,
  resolveShortcuts,
  sameCombo,
  type Combo,
  type CommandId,
  type ShortcutMap,
} from "../app/shortcuts";
import { useContextMenu } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { commandLabel, Keys, SHORTCUT_GROUPS } from "../help/ShortcutList";
import { ICONS } from "../components/icons";
import {
  captureApi,
  DEFAULT_HOTKEY,
  HOTKEY_PREF,
  hotkeyFromEvent,
  hotkeyKeys,
  type Hotkey,
} from "../capture/captureApi";
import { writePref } from "../lib/storage";
import { usePreferences } from "../prefs/PreferencesProvider";
import { tr } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

const sameHotkey = (a: Hotkey, b: Hotkey) =>
  a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.win === b.win && a.key === b.key;

const IGNORED_KEYS = ["Control", "Alt", "Shift", "Meta", "AltGraph"];

/** Raccourci global de la capture rapide : « Modifier », puis la combinaison voulue. */
function CaptureShortcut({ hotkey, onChange, appKeys }: { hotkey: Hotkey | null; onChange: (h: Hotkey) => void; appKeys: ShortcutMap }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (next: Hotkey) => {
    setRecording(false);
    const text = hotkeyKeys(next).join("+");
    const clash = COMMANDS.find((c) => comboText(appKeys[c.id]) === text);
    if (clash) {
      setError(tr("{text} est déjà utilisé : {name}.", { text, name: clash.name }));
      return;
    }
    try {
      await captureApi.setHotkey(next);
      writePref(HOTKEY_PREF, next);
      onChange(next);
      setError(null);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === "taken" ? tr("Ce raccourci est déjà utilisé par un autre logiciel.") : tr("Raccourci indisponible."));
    }
  };

  const record = (e: KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecording(false);
      return;
    }
    if (IGNORED_KEYS.includes(e.key)) return;
    const next = hotkeyFromEvent(e);
    if (next) void apply(next);
    else setError(tr("Combinaison refusée : Ctrl, Alt ou Windows, avec une lettre, un chiffre, Espace ou F1 à F12."));
  };

  return (
    <section className="settings-section" aria-label={tr("Capture rapide")}>
      <h2 className="settings-heading">{tr("Capture rapide")}</h2>
      <div className="settings-card glass">
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Raccourci")}</span>
            <span className="setting-desc">
              {tr("Ouvre la capture rapide depuis n'importe quel logiciel, même Aqueli réduit ou verrouillé. Aussi depuis l'icône près de l'horloge.")}
            </span>
          </div>
          {recording ? (
            <button type="button" className="btn-glass btn-glass--sm shortcut-recording" autoFocus onKeyDown={record} onBlur={() => setRecording(false)}>
              {tr("Saisir la combinaison…")}
            </button>
          ) : (
            <div className="shortcut-edit">
              {hotkey ? (
                <Keys keys={hotkeyKeys(hotkey)} custom={!sameHotkey(hotkey, DEFAULT_HOTKEY)} />
              ) : (
                <span className="setting-desc">{tr("Indisponible : déjà utilisé par un autre logiciel.")}</span>
              )}
              <button
                type="button"
                className="btn-glass btn-glass--sm"
                onClick={() => {
                  setError(null);
                  setRecording(true);
                }}
              >
                {tr("Modifier")}
              </button>
              {hotkey && !sameHotkey(hotkey, DEFAULT_HOTKEY) && (
                <button type="button" className="link-btn" onClick={() => void apply(DEFAULT_HOTKEY)}>
                  {tr("Rétablir|défaut")}
                </button>
              )}
            </div>
          )}
        </div>
        {error && (
          <p className="form-error shortcut-error" role="alert">
            {error}
          </p>
        )}
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Ouvrir la capture rapide")}</span>
            <span className="setting-desc">{tr("Tab change le type d'élément. Entrée ajoute. Échap ferme.")}</span>
          </div>
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => void captureApi.show()}>
            <Icon d={ICONS.plus} size={15} stroke={2.4} />
            {tr("Ouvrir")}
          </button>
        </div>
      </div>
    </section>
  );
}

interface EditableRowProps {
  id: CommandId;
  label: string;
  map: ShortcutMap;
  taken: readonly { keys: readonly string[]; name: string }[];
  onChange: (id: CommandId, combo: Combo | null) => void;
}

/** Raccourci modifiable : « Modifier », puis la nouvelle combinaison ; « Rétablir » l'original. */
function EditableRow({ id, label, map, taken, onChange }: EditableRowProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = map[id];
  const custom = !sameCombo(current, DEFAULT_SHORTCUTS[id]);
  const openMenu = useContextMenu();
  const restore = () => {
    const problem = comboProblem(DEFAULT_SHORTCUTS[id], id, map, taken);
    if (problem) setError(problem);
    else {
      setError(null);
      onChange(id, null);
    }
  };
  const edit = () => {
    setError(null);
    setRecording(true);
  };

  const record = (e: KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecording(false);
      return;
    }
    const next = comboFromEvent(e);
    if (!next) return;
    setRecording(false);
    if (sameCombo(next, current)) return;
    const problem = comboProblem(next, id, map, taken);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onChange(id, next);
  };

  return (
    <div
      className="shortcut-row shortcut-row--edit"
      onContextMenu={(e) =>
        openMenu(e, [
          { label: tr("Modifier le raccourci"), icon: ICONS.pencil, run: edit },
          ...(custom ? [{ label: tr("Rétablir|défaut"), icon: ICONS.undo, run: restore }] : []),
        ])
      }
    >
      <dt>
        {recording ? (
          <button type="button" className="btn-glass btn-glass--sm shortcut-recording" autoFocus onKeyDown={record} onBlur={() => setRecording(false)}>
            {tr("Saisir la combinaison…")}
          </button>
        ) : (
          <Keys keys={comboKeys(current)} custom={custom} />
        )}
      </dt>
      <dd className="shortcut-label">{label}</dd>
      <dd className="shortcut-actions">
        <button
          type="button"
          className="btn-glass btn-glass--sm"
          aria-label={tr("Modifier le raccourci : {label}", { label })}
          onClick={edit}
        >
          {tr("Modifier")}
        </button>
        {custom && (
          <button
            type="button"
            className="link-btn"
            onClick={restore}
          >
            {tr("Rétablir|défaut")}
          </button>
        )}
      </dd>
      {error && (
        <dd className="form-error shortcut-row-error" role="alert">
          {error}
        </dd>
      )}
    </div>
  );
}

export function KeyboardPanel() {
  const { prefs, setPref } = usePreferences();
  const map = resolveShortcuts(prefs.shortcuts);
  const [hotkey, setHotkey] = useState<Hotkey | null>(null);

  useEffect(() => {
    void captureApi
      .hotkey()
      .then(setHotkey)
      .catch(() => setHotkey(null));
  }, []);

  const taken = hotkey ? [{ keys: hotkeyKeys(hotkey), name: tr("Capture rapide") }] : [];

  const change = (id: CommandId, combo: Combo | null) => {
    const next = { ...prefs.shortcuts };
    if (!combo || sameCombo(combo, DEFAULT_SHORTCUTS[id])) delete next[id];
    else next[id] = combo;
    setPref("shortcuts", next);
  };

  const customized = Object.keys(prefs.shortcuts).length > 0;

  return (
    <div className="settings-section">
      <p className="settings-intro">
        <Sentences text={tr("Pour modifier un raccourci d'Aqueli, cliquez sur « Modifier », puis saisissez la nouvelle combinaison. Les raccourcis de Windows et de la saisie restent fixes (Ctrl+Z, Ctrl+C, Entrée, Suppr, F2, Échap…).")} />
      </p>
      <CaptureShortcut hotkey={hotkey} onChange={setHotkey} appKeys={map} />
      <div className="shortcut-groups">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h2 className="settings-heading">{group.title}</h2>
            <dl className="settings-card glass shortcut-list">
              {group.shortcuts.map((s) =>
                "command" in s ? (
                  <EditableRow key={s.command} id={s.command} label={s.label ?? commandLabel(s.command)} map={map} taken={taken} onChange={change} />
                ) : (
                  <div key={s.label} className="shortcut-row">
                    <dt>
                      <Keys keys={s.keys} />
                    </dt>
                    <dd className="shortcut-label">{s.label}</dd>
                  </div>
                ),
              )}
            </dl>
          </section>
        ))}
      </div>
      {customized && (
        <div>
          <button type="button" className="btn-glass" onClick={() => setPref("shortcuts", {})}>
            <Icon d={ICONS.undo} size={15} stroke={2.2} />
            {tr("Rétablir tous les raccourcis")}
          </button>
        </div>
      )}
    </div>
  );
}
