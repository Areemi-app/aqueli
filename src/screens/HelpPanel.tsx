/** Paramètres › Aide : aide intégrée, liste des raccourcis, visite générale et visite de chaque module. */
import { useContextMenu } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { SHORTCUTS_TOPIC, topicForRoute } from "../help/helpRoutes";
import { requestHelp } from "../help/helpRequest";
import { visibleModules } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { usePreferences, useShortcut } from "../prefs/PreferencesProvider";
import { requestTour } from "../tour/tourRequest";
import { tr } from "../i18n/i18n";

export function HelpPanel() {
  const { prefs } = usePreferences();
  const helpKeys = useShortcut("help");
  const shortcutKeys = useShortcut("shortcuts");
  const modules = visibleModules(prefs.hiddenModules);
  const openMenu = useContextMenu();
  const { go } = useNavigation();

  return (
    <>
      <div className="settings-section">
        <h2 className="settings-heading">{tr("Aide")}</h2>
        <div className="settings-card glass">
          <div className="setting-row">
            <div className="setting-text">
              <span className="setting-label">{tr("Aide intégrée")}</span>
              <span className="setting-desc">{tr("Rubrique de l'écran affiché, consultable hors ligne ({keys}).", { keys: helpKeys })}</span>
            </div>
            <button type="button" className="btn-glass btn-glass--sm" onClick={() => requestHelp()}>
              <Icon d={ICONS.help} size={14} stroke={2.2} />
              {tr("Ouvrir")}
            </button>
          </div>
          <div className="setting-row">
            <div className="setting-text">
              <span className="setting-label">{tr("Raccourcis clavier")}</span>
              <span className="setting-desc">{tr("Liste complète ({keys}).", { keys: shortcutKeys })}</span>
            </div>
            <button type="button" className="btn-glass btn-glass--sm" onClick={() => requestHelp(SHORTCUTS_TOPIC)}>
              <Icon d={ICONS.keyboard} size={14} stroke={2.2} />
              {tr("Afficher")}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-heading">{tr("Visite guidée")}</h2>
        <div className="settings-card glass">
          <div className="setting-row">
            <div className="setting-text">
              <span className="setting-label">{tr("Visite générale")}</span>
              <span className="setting-desc">{tr("Les bases d'Aqueli, en quelques étapes. Échap arrête la visite à tout moment.")}</span>
            </div>
            <button type="button" className="btn-gel btn-gel--sm" onClick={() => requestTour("general")}>
              <Icon d={ICONS.play} size={13} stroke={2.4} />
              {tr("Lancer")}
            </button>
          </div>
        </div>
        <p className="settings-intro tour-modules-intro">{tr("Visite d'un module : son écran s'ouvre et ses parties sont présentées une à une.")}</p>
        <div className="tour-modules">
          {modules.map((m) => (
            <button key={m.key} type="button" className="tour-module glass" title={tr("Visite : {label}", { label: m.label })} onClick={() => requestTour(m.key)}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: tr("Lancer la visite"), icon: ICONS.play, run: () => requestTour(m.key) },
                  { label: tr("Ouvrir l'aide"), icon: ICONS.help, run: () => requestHelp(topicForRoute(m.key)) },
                  "separator",
                  { label: tr("Ouvrir le module"), icon: m.icon, run: () => go(m.key) },
                ])
              }
            >
              <ModuleChip color={m.color} icon={m.icon} size={30} />
              <span className="tour-module-text">
                <span className="tour-module-label">{m.label}</span>
                <span className="tour-module-desc">{m.summary}</span>
              </span>
              <Icon d={ICONS.play} size={13} stroke={2.4} className="tour-module-play" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
