/**
 * Mini-lecteur du Focus : petite fenêtre toujours visible, même hors d'Aqueli. Temps restant,
 * phase, et les boutons Suspendre/Reprendre, Arrêter, Ouvrir Aqueli, Taille, Fermer. Elle ne voit
 * que l'état du minuteur. Trois tailles prévues, lues sur la largeur de la fenêtre ; Échap la ferme.
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

type Layout = "compacte" | "standard" | "grande";
const layoutOf = (width: number): Layout => (width < 260 ? "compacte" : width >= 420 ? "grande" : "standard");
const RING: Record<Layout, number> = { compacte: 46, standard: 60, grande: 92 };

/** Taille de la fenêtre (une des trois prévues), suivie quand elle change. */
function useLayout(): Layout {
  const [layout, setLayout] = useState(() => layoutOf(window.innerWidth));
  useEffect(() => {
    const update = () => setLayout(layoutOf(window.innerWidth));
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return layout;
}

function Mini() {
  const [state, setState] = useState<MiniState | null>(null);
  useEffect(() => {
    invoke<MiniState | null>("focus_mini_current")
      .then((s) => s && setState(s))
      .catch(() => undefined);
    return onAppEvent<MiniState>(MINI_STATE_EVENT, setState);
  }, []);
  // Échap ferme toujours le lecteur.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") send("detacher");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const layout = useLayout();
  const timer = state ? timerOf(state) : null;
  const now = useTimerNow(state?.status === "en-cours");
  if (!timer) return <div className="mini-focus glass-popover" data-tauri-drag-region data-size={layout} />;
  const running = timer.status === "en-cours";
  const full = layout !== "compacte";
  const icon = layout === "grande" ? 18 : 14;
  return (
    <div className="mini-focus glass-popover" data-tauri-drag-region data-phase={timer.phase} data-size={layout}>
      <FocusRing timer={timer} now={now} size={RING[layout]} caption="" />
      {full && (
        <div className="mini-focus-text" data-tauri-drag-region>
          <span className="mini-focus-phase" data-tauri-drag-region>
            {timer.status === "arret" && timer.phase === "concentration" ? tr("Prête à démarrer") : phaseCaption(timer)}
          </span>
          <span className="mini-focus-state" data-tauri-drag-region>
            {running ? tr("En cours") : timer.status === "suspendu" ? tr("Suspendue") : tr("À l'arrêt")}
          </span>
        </div>
      )}
      <div className="mini-focus-buttons">
        <button type="button" className="mini-btn mini-btn--main" aria-label={running ? tr("Suspendre") : tr("Reprendre")} title={running ? tr("Suspendre") : tr("Reprendre")} onClick={() => send("basculer")}>
          <Icon d={running ? ICONS.pause : ICONS.play} size={icon + 1} stroke={2.6} />
        </button>
        {full && (
          <button type="button" className="mini-btn" aria-label={tr("Arrêter la séance")} title={tr("Arrêter la séance")} onClick={() => send("arreter")}>
            <Icon d={ICONS.stop} size={icon} stroke={2.4} />
          </button>
        )}
        {full && (
          <button type="button" className="mini-btn" aria-label={tr("Ouvrir Aqueli")} title={tr("Ouvrir Aqueli")} onClick={() => send("afficher")}>
            <Icon d={ICONS.windowReturn} size={icon} stroke={2.4} />
          </button>
        )}
        <button type="button" className="mini-btn" aria-label={tr("Changer la taille")} title={tr("Changer la taille")} onClick={() => send("taille")}>
          <Icon d={ICONS.sizes} size={icon} stroke={2.2} />
        </button>
        <button type="button" className="mini-btn" aria-label={tr("Fermer le mini-lecteur")} title={tr("Fermer le mini-lecteur")} onClick={() => send("detacher")}>
          <Icon d={ICONS.close} size={icon - 1} stroke={2.4} />
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
