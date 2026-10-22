import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import logo from "../assets/aqueli-logo-256.png";
import { captureApi, hotkeyKeys, onHotkeyChange } from "../capture/captureApi";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { useNavigation } from "../navigation/NavigationProvider";
import { useShortcut } from "../prefs/PreferencesProvider";
import { useVault } from "../vault/VaultProvider";
import { BackupButton } from "../backups/BackupButton";
import { requestHelp } from "../help/helpRequest";
import { SpaceSelector } from "./SpaceSelector";
import { WindowControls } from "./WindowControls";
import { tr } from "../i18n/i18n";
import { useThemeBanner } from "../theme/bannerPref";
import { useContextMenu } from "../components/ContextMenu";
import { nextReminders, openReminder, useUpcomingReminders } from "../app/reminderFeed";
import { preselectSettingsTab } from "../screens/settingsTab";

interface TitleBarProps {
  onOpenPalette: () => void;
  spacesOpen: boolean;
  onSpacesOpenChange: (open: boolean) => void;
}

/**
 * Barre de titre maison (maquette BarreTitre.dc.html). Toute la barre sert à déplacer
 * la fenêtre, sauf les boutons (« data-tauri-drag-region="deep" ») ; un double-clic l'agrandit.
 */
export function TitleBar({ onOpenPalette, spacesOpen, onSpacesOpenChange }: TitleBarProps) {
  const [captureKeys, setCaptureKeys] = useState<string | null>(null);
  useEffect(() => {
    const read = () =>
      void captureApi
        .hotkey()
        .then((h) => setCaptureKeys(h ? hotkeyKeys(h).join("+") : null))
        .catch(() => setCaptureKeys(null));
    read();
    return onHotkeyChange(read);
  }, []);
  const { back, forward, canBack, canForward, go } = useNavigation();
  const backKeys = useShortcut("back");
  const forwardKeys = useShortcut("forward");
  const paletteKeys = useShortcut("palette");
  const lockKeys = useShortcut("lock");
  const helpKeys = useShortcut("help");
  const { lock } = useVault();
  const banner = useThemeBanner();
  const openMenu = useContextMenu();
  const upcoming = useUpcomingReminders();
  // Cloche : les rappels des 24 prochaines heures ; un choix ouvre l'élément.
  const showReminders = (e: MouseEvent<HTMLButtonElement>) => {
    const next = nextReminders(upcoming, Date.now()).slice(0, 8);
    openMenu({ clientX: 0, clientY: 0, currentTarget: e.currentTarget, preventDefault: () => {}, stopPropagation: () => {} }, [
      { label: tr("Prochains rappels"), disabled: true, run: () => {} },
      ...(next.length > 0
        ? next.map((r) => ({ label: r.title, detail: r.when, icon: ICONS.bell, run: () => openReminder(r.taskId) }))
        : [{ label: tr("Aucun rappel dans les prochaines 24 heures."), disabled: true, run: () => {} }]),
      "separator",
      {
        label: tr("Paramètres › Rappels"),
        icon: ICONS.settings,
        run: () => {
          preselectSettingsTab("rappels");
          go("parametres");
        },
      },
    ]);
  };

  return (
    <header className="titlebar" data-banner={banner ? "" : undefined} data-tauri-drag-region="deep">
      {banner && <div className="titlebar-banner" aria-hidden="true" style={{ "--banner": banner } as CSSProperties} />}
      <div className="titlebar-start">
      <img className="titlebar-logo" src={logo} alt="" draggable={false} />
      <span className="titlebar-name">Aqueli</span>

      <div className="history-buttons">
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          aria-label={tr("Précédent ({backKeys})", { backKeys })}
          title={tr("Précédent ({backKeys})", { backKeys })}
          disabled={!canBack}
          onClick={back}
        >
          <Icon d={ICONS.arrowLeft} size={16} stroke={2.2} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          aria-label={tr("Suivant ({forwardKeys})", { forwardKeys })}
          title={tr("Suivant ({forwardKeys})", { forwardKeys })}
          disabled={!canForward}
          onClick={forward}
        >
          <Icon d={ICONS.arrowRight} size={16} stroke={2.2} />
        </button>
      </div>

      <SpaceSelector open={spacesOpen} onOpenChange={onSpacesOpenChange} />
      <BackupButton />
      <button
        type="button"
        className="help-button"
        aria-label={tr("Aide ({helpKeys})", { helpKeys })}
        title={tr("Aide ({helpKeys})", { helpKeys })}
        onClick={() => requestHelp()}
      >
        <Icon d={ICONS.bulb} size={17} stroke={2} />
      </button>
      </div>

      <div className="titlebar-center">
        <button
          type="button"
          className="search-field"
          aria-label={tr("Rechercher ou lancer une commande ({paletteKeys})", { paletteKeys })}
          onClick={onOpenPalette}
        >
          <Icon d={ICONS.search} size={16} stroke={2.2} className="search-icon" />
          <span className="search-placeholder">
            <span className="search-placeholder-long">{tr("Rechercher ou lancer une commande…")}</span>
            <span className="search-placeholder-short">{tr("Rechercher…")}</span>
          </span>
          <kbd className="kbd hide-when-narrow">{paletteKeys.replaceAll("+", " ")}</kbd>
        </button>
      </div>

      <div className="titlebar-end">
      <button
        type="button"
        className="btn-gel btn-gel--sm"
        data-tour="capture"
        title={captureKeys ? tr("Capture rapide ({captureKeys})", { captureKeys }) : tr("Capture rapide")}
        onClick={() => void captureApi.show()}
      >
        <Icon d={ICONS.plus} size={16} stroke={2.8} />
        <span className="hide-below-wide">{tr("Capture rapide")}</span>
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={tr("Prochains rappels")}
        aria-haspopup="menu"
        title={tr("Prochains rappels")}
        onClick={showReminders}
      >
        <Icon d={ICONS.bell} size={18} />
      </button>
      <button
        type="button"
        className="icon-btn"
        data-sans-son
        data-tour="verrouiller"
        aria-label={tr("Verrouiller Aqueli ({lockKeys})", { lockKeys })}
        title={tr("Verrouiller ({lockKeys})", { lockKeys })}
        onClick={() => void lock("manuel")}
      >
        <Icon d={ICONS.lock} size={18} />
      </button>

      <WindowControls />
      </div>
    </header>
  );
}
