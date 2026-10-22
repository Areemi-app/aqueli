/**
 * Mini-lecteur du Focus dans Aqueli : en bas à droite, sur les autres écrans, pendant une
 * séance. Suspendre, arrêter, revenir au Focus ou ouvrir la petite fenêtre toujours visible ;
 * il se réduit à une pastille, ou se ferme jusqu'à la prochaine séance.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { readPref, writePref } from "../lib/storage";
import { useNavigation } from "../navigation/NavigationProvider";
import { useTasks } from "../tasks/TasksProvider";
import { clock, PHASE_LABELS, shownMs } from "./timer";
import { useFocus, useTimerNow } from "./FocusProvider";
import { FocusRing, phaseCaption } from "./FocusRing";
import { miniWindowState, pinMiniWindow, sessionActive, subscribeMiniWindow } from "./miniWindow";
import { tr } from "../i18n/i18n";

const REDUCED = "focusMiniReduit";

export function FocusDock() {
  const { timer, start, suspend, stop } = useFocus();
  const { tasks } = useTasks();
  const { route, go } = useNavigation();
  const now = useTimerNow(timer.status === "en-cours");
  const [reduced, setReduced] = useState(() => readPref(REDUCED, false, (v): v is boolean => typeof v === "boolean"));
  const [closed, setClosed] = useState(false);
  const mini = useSyncExternalStore(subscribeMiniWindow, miniWindowState);
  const active = sessionActive(timer);
  // Une nouvelle séance le fait revenir.
  useEffect(() => {
    if (!active) setClosed(false);
  }, [active]);
  // Un seul lecteur à la fois : la petite fenêtre affichée, celui-ci s'efface.
  if (!active || closed || mini.shown || route === "focus") return null;

  const running = timer.status === "en-cours";
  const task = timer.taskId ? tasks.find((t) => t.id === timer.taskId) : undefined;
  const reduce = (on: boolean) => {
    setReduced(on);
    writePref(REDUCED, on);
  };

  if (reduced) {
    return (
      <button
        type="button"
        className="focus-dock focus-dock--pill glass-popover"
        data-phase={timer.phase}
        data-status={timer.status}
        onClick={() => reduce(false)}
        aria-label={tr("{x} : {clock}. Agrandir le mini-lecteur", { x: PHASE_LABELS[timer.phase], clock: clock(shownMs(timer, now)) })}
        title={tr("Agrandir le mini-lecteur")}
      >
        <span className="focus-dock-dot" aria-hidden="true" />
        <span className="focus-dock-time">{clock(shownMs(timer, now))}</span>
      </button>
    );
  }

  return (
    <section className="focus-dock glass-popover" data-phase={timer.phase} aria-label={tr("Mini-lecteur du Focus")}>
      <FocusRing timer={timer} now={now} size={58} caption="" />
      <div className="focus-dock-text">
        <span className="focus-dock-phase">{phaseCaption(timer)}</span>
        <span className="focus-dock-task">{timer.intention ?? task?.title ?? (running ? tr("En cours") : timer.status === "suspendu" ? tr("Suspendue") : tr("À l'arrêt"))}</span>
        <div className="focus-dock-buttons">
          <button type="button" className="mini-btn mini-btn--main" aria-label={running ? tr("Suspendre") : tr("Reprendre")} title={running ? tr("Suspendre") : tr("Reprendre")} onClick={running ? suspend : start} data-sans-son>
            <Icon d={running ? ICONS.pause : ICONS.play} size={14} stroke={2.6} />
          </button>
          <button type="button" className="mini-btn" aria-label={tr("Arrêter la séance")} title={tr("Arrêter la séance")} onClick={stop} data-sans-son>
            <Icon d={ICONS.stop} size={13} stroke={2.4} />
          </button>
          <button type="button" className="mini-btn" aria-label={tr("Ouvrir le Focus")} title={tr("Ouvrir le Focus")} onClick={() => go("focus")}>
            <Icon d={ICONS.expand} size={13} stroke={2.4} />
          </button>
          <button
            type="button"
            className="mini-btn"
            aria-pressed={mini.pinned}
            aria-label={tr("Afficher hors d'Aqueli")}
            title={mini.pinned ? tr("Ne plus afficher hors d'Aqueli") : tr("Afficher hors d'Aqueli")}
            onClick={() => pinMiniWindow(!mini.pinned)}
          >
            <Icon d={ICONS.pin} size={13} stroke={2.2} />
          </button>
        </div>
      </div>
      <div className="focus-dock-corner">
        <button type="button" className="mini-btn mini-btn--ghost" aria-label={tr("Réduire le mini-lecteur")} title={tr("Réduire")} onClick={() => reduce(true)}>
          <Icon d="M6 12h12" size={13} stroke={2.6} />
        </button>
        <button type="button" className="mini-btn mini-btn--ghost" aria-label={tr("Fermer le mini-lecteur")} title={tr("Fermer jusqu'à la prochaine séance")} onClick={() => setClosed(true)}>
          <Icon d={ICONS.close} size={12} stroke={2.6} />
        </button>
      </div>
    </section>
  );
}
