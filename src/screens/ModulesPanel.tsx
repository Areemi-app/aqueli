import { useContextMenu } from "../components/ContextMenu";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { MODULE_GROUPS, MODULES, type ModuleDef, type ModuleKey } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { usePreferences } from "../prefs/PreferencesProvider";
import { tr } from "../i18n/i18n";

/** Paramètres › Modules : modules affichés dans la barre latérale et la palette, par catégorie. */
export function ModulesPanel() {
  const { prefs, setPref } = usePreferences();
  const { go } = useNavigation();
  const openMenu = useContextMenu();
  const hidden = prefs.hiddenModules;
  const toggle = (key: ModuleKey, shown: boolean) =>
    setPref("hiddenModules", shown ? hidden.filter((k) => k !== key) : [...hidden, key]);

  const row = (m: ModuleDef) => {
    const fixed = m.key === "accueil";
    const shown = fixed || !hidden.includes(m.key);
    const labelId = `module-${m.key}`;
    return (
      <div
        key={m.key}
        className="setting-row module-row"
        onContextMenu={(e) =>
          openMenu(e, [
            { label: tr("Ouvrir"), icon: m.icon, run: () => go(m.key) },
            ...(fixed
              ? []
              : [
                  shown
                    ? { label: tr("Masquer de la barre latérale"), icon: ICONS.eyeOff, run: () => toggle(m.key, false) }
                    : { label: tr("Afficher dans la barre latérale"), icon: ICONS.eye, run: () => toggle(m.key, true) },
                ]),
          ])
        }
      >
        <ModuleChip color={m.color} icon={m.icon} size={30} />
        <div className="setting-text">
          <span id={labelId} className="setting-label">
            {m.label}
          </span>
          <span className="setting-desc">{fixed ? tr("Toujours affiché.") : m.summary}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={shown}
          aria-labelledby={labelId}
          className="switch"
          disabled={fixed}
          onClick={() => toggle(m.key, !shown)}
        >
          <span className="switch-thumb" />
        </button>
      </div>
    );
  };

  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Barre latérale")}</h2>
      <p className="settings-intro">
        {tr("Les modules masqués disparaissent de la barre latérale et de la palette.")}
      </p>
      <div className="settings-card glass">{MODULES.filter((m) => !m.group).map(row)}</div>
      {MODULE_GROUPS.map((g) => (
        <section key={g.key} className="settings-section" aria-label={g.label}>
          <h2 className="settings-heading">{g.label}</h2>
          <div className="settings-card glass">{MODULES.filter((m) => m.group === g.key).map(row)}</div>
        </section>
      ))}
      {hidden.length > 0 && (
        <button type="button" className="btn-glass btn-glass--sm modules-reset" onClick={() => setPref("hiddenModules", [])}>
          {tr("Afficher tous les modules")}
        </button>
      )}
    </div>
  );
}
