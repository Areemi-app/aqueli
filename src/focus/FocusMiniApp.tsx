/**
 * Mini-lecteur du Focus : petite fenêtre toujours visible, même hors d'Aqueli. Temps restant,
 * phase, et les boutons Suspendre/Reprendre, Arrêter, Ouvrir Aqueli, Fermer. Elle ne voit que
 * l'état du minuteur.
 */
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { onAppEvent } from "../app/background";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { PreferencesProvider } from "../prefs/PreferencesProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { useTimerNow } from "./FocusProvider";
import { FocusRing, phaseCaption } from "./FocusRing";
import { MINI_STATE_EVENT, timerOf, type MiniAction, type MiniState } from "./miniWindow";
import { tr } from "../i18n/i18n";

const send = (action: MiniAction) => void invoke("focus_mini_command", { action }).catch(() => undefined);

function Mini() {
  const [state, setState] = useState<MiniState | null>(null);
  useEffect(() => {
    invoke<MiniState | null>("focus_mini_current")
      .then((s) => s && setState(s))
      .catch(() => undefined);
    return onAppEvent<MiniState>(MINI_STATE_EVENT, setState);
  }, []);
  const timer = state ? timerOf(state) : null;
  const now = useTimerNow(state?.status === "en-cours");
  if (!timer) return <div className="mini-focus glass-popover" data-tauri-drag-region />;
  const running = timer.status === "en-cours";
  return (
    <div className="mini-focus glass-popover" data-tauri-drag-region data-phase={timer.phase}>
      <FocusRing timer={timer} now={now} size={60} caption="" />
      <div className="mini-focus-text" data-tauri-drag-region>
        <span className="mini-focus-phase" data-tauri-drag-region>
          {timer.status === "arret" && timer.phase === "concentration" ? tr("Prête à démarrer") : phaseCaption(timer)}
        </span>
        <span className="mini-focus-state" data-tauri-drag-region>
          {running ? tr("En cours") : timer.status === "suspendu" ? tr("Suspendue") : tr("À l'arrêt")}
        </span>
      </div>
      <div className="mini-focus-buttons">
        <button type="button" className="mini-btn mini-btn--main" aria-label={running ? tr("Suspendre") : tr("Reprendre")} title={running ? tr("Suspendre") : tr("Reprendre")} onClick={() => send("basculer")}>
          <Icon d={running ? ICONS.pause : ICONS.play} size={15} stroke={2.6} />
        </button>
        <button type="button" className="mini-btn" aria-label={tr("Arrêter la séance")} title={tr("Arrêter la séance")} onClick={() => send("arreter")}>
          <Icon d={ICONS.stop} size={14} stroke={2.4} />
        </button>
        <button type="button" className="mini-btn" aria-label={tr("Ouvrir Aqueli")} title={tr("Ouvrir Aqueli")} onClick={() => send("afficher")}>
          <Icon d={ICONS.expand} size={14} stroke={2.4} />
        </button>
        <button type="button" className="mini-btn" aria-label={tr("Fermer le mini-lecteur")} title={tr("Fermer le mini-lecteur")} onClick={() => send("detacher")}>
          <Icon d={ICONS.close} size={13} stroke={2.4} />
        </button>
      </div>
    </div>
  );
}

export function FocusMiniApp() {
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <Mini />
      </ThemeProvider>
    </PreferencesProvider>
  );
}
