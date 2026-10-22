import { useId, type CSSProperties } from "react";
import { useContextMenu } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { SwitchRow } from "../components/Switch";
import { useSound } from "../sound/SoundProvider";
import { paletteFor, type SoundCategory, type SoundName } from "../sound/sounds";
import { useTheme } from "../theme/ThemeProvider";
import { tr } from "../i18n/i18n";

const CATEGORIES: readonly { key: SoundCategory; label: string; description: string; sample: SoundName }[] = [
  { key: "interface", label: tr("Interface"), description: tr("Clics sur les boutons, onglets et interrupteurs."), sample: "clic" },
  { key: "achevement", label: tr("Achèvement"), description: tr("Tâche terminée."), sample: "bulle" },
  { key: "notifications", label: tr("Notifications"), description: tr("Rappels et alertes."), sample: "carillon" },
  { key: "ambiance", label: tr("Ouverture et verrouillage"), description: tr("Déverrouillage, verrouillage, ouverture."), sample: "deverrouillage" },
];

function VolumeRow() {
  const { prefs, setPrefs, preview } = useSound();
  const id = useId();
  return (
    <div className="setting-row" data-disabled={!prefs.enabled || undefined}>
      <div className="setting-text">
        <label htmlFor={id} className="setting-label">
          {tr("Volume")}
        </label>
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={0}
        max={100}
        step={5}
        value={prefs.volume}
        disabled={!prefs.enabled}
        onChange={(e) => {
          const volume = Number(e.target.value);
          setPrefs((p) => ({ ...p, volume }));
        }}
        onPointerUp={() => preview("carillon")}
        onKeyUp={() => preview("clic")}
        style={{ "--range-fill": `${prefs.volume}%` } as CSSProperties}
        aria-valuetext={`${prefs.volume} %`}
        data-sans-son
      />
      <span className="range-value">{prefs.volume} %</span>
    </div>
  );
}

/** Couleur sonore du thème affiché (chaque thème a la sienne). */
function ThemeSoundsRow() {
  const { theme } = useTheme();
  const { prefs, preview } = useSound();
  const palette = paletteFor(theme.sounds ?? theme.id);
  return (
    <div className="setting-row" data-disabled={!prefs.enabled || undefined}>
      <div className="setting-text">
        <span className="setting-label">{tr("Sons du thème")}</span>
        <span className="setting-desc">
          {tr("{sounds} · thème « {theme} ». Chaque thème a ses propres sons.", { sounds: palette.label, theme: theme.name })}
        </span>
      </div>
      <button
        type="button"
        className="btn-glass btn-glass--sm sound-listen"
        data-sans-son
        disabled={!prefs.enabled}
        onClick={() => {
          preview("bulle");
          window.setTimeout(() => preview("carillon"), 380);
        }}
      >
        <Icon d={ICONS.speaker} size={15} />
        {tr("Écouter")}
      </button>
    </div>
  );
}

export function SoundsPanel() {
  const { prefs, setPrefs, preview } = useSound();
  const openMenu = useContextMenu();
  const setCategory = (key: SoundCategory, on: boolean) => setPrefs((p) => ({ ...p, categories: { ...p.categories, [key]: on } }));
  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Sons")}</h2>
      <div className="settings-card glass">
        <SwitchRow
          label={tr("Sons d'Aqueli")}
          description={tr("Sons doux et courts, créés pour Aqueli.")}
          checked={prefs.enabled}
          onChange={(enabled) => setPrefs((p) => ({ ...p, enabled }))}
        />
        <VolumeRow />
        <ThemeSoundsRow />
      </div>
      <h2 className="settings-heading">{tr("Catégories")}</h2>
      <div className="settings-card glass">
        {CATEGORIES.map((c) => (
          <div
            key={c.key}
            className="sound-row"
            onContextMenu={(e) =>
              openMenu(e, [
                { label: tr("Écouter"), icon: ICONS.speaker, run: () => preview(c.sample) },
                {
                  label: tr("Activer ces sons"),
                  checked: prefs.categories[c.key],
                  disabled: !prefs.enabled,
                  run: () => setCategory(c.key, !prefs.categories[c.key]),
                },
              ])
            }
          >
            <SwitchRow
              label={c.label}
              description={c.description}
              checked={prefs.categories[c.key]}
              disabled={!prefs.enabled}
              onChange={(on) => setCategory(c.key, on)}
            />
            <button
              type="button"
              className="btn-glass btn-glass--sm sound-listen"
              data-sans-son
              onClick={() => preview(c.sample)}
            >
              <Icon d={ICONS.speaker} size={15} />
              {tr("Écouter")}
            </button>
          </div>
        ))}
      </div>
      <p className="settings-hint">{tr("Chaque thème a sa sonorité : gouttes d'eau pour Aqua, clochettes pour Nuit étoilée.")}</p>
    </div>
  );
}
