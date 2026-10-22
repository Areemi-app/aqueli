import type { MouseEvent } from "react";
import { useContextMenu, type MenuEntry } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { useImport } from "../import/ImportProvider";
import { openSupport } from "../lib/support";
import { useNavigation } from "../navigation/NavigationProvider";
import { lang, LANGUAGES, setLanguage } from "../i18n/i18n";
import { preselectSettingsTab, type SettingsTab } from "../screens/settingsTab";
import { useSpaces } from "../spaces/SpacesProvider";
import { spaceFilterLabel } from "../spaces/spaces";
import { useShortcut } from "../prefs/PreferencesProvider";
import { setBannerEnabled, useBannerEnabled } from "../theme/bannerPref";
import { useTheme } from "../theme/ThemeProvider";
import { AUTO_LOCK_CHOICES, useVault } from "../vault/VaultProvider";
import { tr } from "../i18n/i18n";

/**
 * Barre d'état en bas de la fenêtre (maquette Main.dc.html). Les pictogrammes et séparateurs
 * marqués `status-extra` ne s'affichent qu'avec le style Signature (src/styles/signature.css).
 * « Thème » et « Verrouillage automatique » ouvrent chacun un menu de choix rapides ;
 * « Soutenir Aqueli » ouvre la page Ko-fi dans le navigateur.
 */
export function StatusBar() {
  const { theme, themes, reason, settings, setThemeId, keepToday, backToPreferred, surpriseMe } = useTheme();
  const { filter, spaces } = useSpaces();
  const { autoLockMinutes, setAutoLockMinutes, lock } = useVault();
  const { pending, prefs, open } = useImport();
  const { go } = useNavigation();
  const openMenu = useContextMenu();
  const banner = useBannerEnabled();
  const lockKeys = useShortcut("lock");
  const waiting = prefs.watch ? pending.length : 0;
  // Ouvre la page voulue des Paramètres, même s'ils sont déjà affichés.
  const openSettings = (tab: SettingsTab) => {
    preselectSettingsTab(tab);
    go("parametres");
  };
  // Menu ancré au bouton : il s'ouvre au-dessus de la barre.
  const anchored = (e: MouseEvent<HTMLButtonElement>, entries: MenuEntry[]) =>
    openMenu({ clientX: 0, clientY: 0, currentTarget: e.currentTarget, preventDefault: () => {}, stopPropagation: () => {} }, entries);

  const themeMenu = (e: MouseEvent<HTMLButtonElement>) => {
    const preferred = themes.find((t) => t.id === settings.fixed);
    anchored(e, [
      ...themes
        .filter((t) => t.family === theme.family)
        .map((t) => ({ label: t.name, checked: t.id === theme.id, run: () => setThemeId(t.id) })),
      { label: tr("Autres thèmes…"), icon: ICONS.palette, run: () => openSettings("apparence") },
      "separator",
      reason === "aujourdhui" && preferred
        ? { label: tr("Revenir à {name}", { name: preferred.name }), icon: ICONS.undo, run: backToPreferred }
        : { label: tr("Garder aujourd'hui"), icon: ICONS.pin, run: keepToday },
      { label: tr("Surprends-moi"), icon: ICONS.sparkle, run: surpriseMe },
      "separator",
      { label: tr("Bannière illustrée"), checked: banner, run: () => setBannerEnabled(!banner) },
    ]);
  };

  const languageMenu = (e: MouseEvent<HTMLButtonElement>) =>
    anchored(e, LANGUAGES.map((l) => ({ label: l.label, checked: l.id === lang(), run: () => void setLanguage(l.id) })));
  const languageLabel = LANGUAGES.find((l) => l.id === lang())?.label ?? "";

  const lockMenu = (e: MouseEvent<HTMLButtonElement>) =>
    anchored(e, [
      { label: tr("Verrouiller maintenant"), icon: ICONS.lock, shortcut: lockKeys, run: () => void lock("manuel") },
      "separator",
      { label: tr("Verrouiller automatiquement après"), disabled: true, run: () => {} },
      ...AUTO_LOCK_CHOICES.map((m) => ({ label: `${m} min`, checked: m === autoLockMinutes, run: () => setAutoLockMinutes(m) })),
      "separator",
      { label: tr("Paramètres › Sécurité"), icon: ICONS.settings, run: () => openSettings("securite") },
    ]);

  return (
    <footer className="statusbar" data-menu-edge>
      <span className="status-item status-item--strong">
        <Icon d={ICONS.lock} size={12} stroke={2.6} />
        {tr("Données chiffrées")}
      </span>
      <span className="status-sep status-extra" aria-hidden="true" />
      <span className="status-item">{tr("Espace : {space}", { space: spaceFilterLabel(filter, spaces) })}</span>
      <span className="status-spacer" />
      {waiting > 0 && (
        <button type="button" className="status-item status-action" onClick={() => open(pending[0]!)} title={tr("Afficher l'aperçu de l'import")}>
          <Icon d={ICONS.importFile} size={12} stroke={2.6} />
          {waiting === 1 ? tr("1 fichier à importer") : tr("{waiting} fichiers à importer", { waiting })}
        </button>
      )}
      <button type="button" className="status-item status-link status-support" onClick={openSupport} title={tr("Soutenir Aqueli")}>
        <Icon d={ICONS.heart} size={13} stroke={2.2} />
        <span className="hide-when-narrow">{tr("Soutenir Aqueli")}</span>
      </button>
      <span className="status-sep status-extra" aria-hidden="true" />
      <button type="button" className="status-item status-link" aria-haspopup="menu" onClick={themeMenu} title={tr("Choisir un thème")}>
        <Icon d={ICONS.droplet} size={13} stroke={2.2} className="status-extra" />
        {tr("Thème {name}", { name: theme.name })}
      </button>
      <span className="status-sep status-extra" aria-hidden="true" />
      <button type="button" className="status-item status-link" aria-haspopup="menu" onClick={languageMenu} title={tr("Langue")}>
        <Icon d={ICONS.globe} size={13} stroke={2.2} className="status-clock" />
        <span className="hide-when-narrow">{languageLabel}</span>
      </button>
      <span className="status-sep status-extra" aria-hidden="true" />
      {/* Fenêtre étroite : l'horloge et le délai seulement ; l'infobulle garde le sens. */}
      <button type="button" className="status-item status-link" aria-haspopup="menu" onClick={lockMenu} title={tr("Délai de verrouillage")}>
        <Icon d={ICONS.clock} size={13} stroke={2.2} className="status-clock" />
        <span className="hide-when-narrow">{tr("Verrouillage automatique : ")}</span>
        {autoLockMinutes}
        {tr(" min")}
        <Icon d={ICONS.chevronUp} size={12} stroke={2.6} className="status-extra" />
      </button>
    </footer>
  );
}
