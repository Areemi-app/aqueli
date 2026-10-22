/**
 * Anneau du minuteur et boutons du Focus : partagés par l'écran Focus, l'Accueil, le mini-lecteur
 * et la petite fenêtre (l'écran Focus, lui, se charge à sa première ouverture).
 */
import { useId, type CSSProperties } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { RAINBOW } from "../theme/brand";
import { useFocus } from "./FocusProvider";
import { clock, countsUp, elapsedMs, PHASE_LABELS, phaseTotal, remainingMs, shownMs, type TimerState } from "./timer";
import { tr } from "../i18n/i18n";

/** « Séance 2 sur 4 », « Séance libre », « Pause », « Longue pause ». */
export function phaseCaption(timer: TimerState): string {
  if (timer.phase !== "concentration") return PHASE_LABELS[timer.phase];
  return timer.plan.flow ? tr("Séance libre") : tr("Séance {cycle} sur {every}", { cycle: timer.cycle, every: timer.plan.every });
}

interface FocusRingProps {
  timer: TimerState;
  now: number;
  size: number;
  /** Texte sous les chiffres. */
  caption?: string;
}

/**
 * Anneau arc-en-ciel : il se vide à mesure que la phase s'écoule. Pendant une séance libre, il
 * se remplit en une heure, comme le tour d'une aiguille, et le temps écoulé s'affiche.
 */
export function FocusRing({ timer, now, size, caption }: FocusRingProps) {
  const gradientId = useId().replace(/:/g, "");
  const total = phaseTotal(timer);
  const left = remainingMs(timer, now);
  const up = countsUp(timer);
  const shown = shownMs(timer, now);
  const r = 58;
  const length = 2 * Math.PI * r;
  const share = up ? (elapsedMs(timer, now) % 3_600_000) / 3_600_000 : total === 0 ? 0 : left / total;
  return (
    <div
      className="focus-ring"
      data-phase={timer.phase}
      data-status={timer.status}
      style={{ width: size, height: size, "--ring": `${size}px` } as CSSProperties}
    >
      <svg width={size} height={size} viewBox="0 0 136 136" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            {RAINBOW.map((s) => (
              <stop key={s.offset} offset={s.offset} style={{ stopColor: s.color }} />
            ))}
          </linearGradient>
        </defs>
        <circle cx="68" cy="68" r={r} fill="none" className="focus-track" strokeWidth="12" />
        <circle
          cx="68"
          cy="68"
          r={r}
          fill="none"
          className="focus-progress"
          stroke={`url(#${gradientId})`}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - share)}
          transform="rotate(-90 68 68)"
          opacity={share > 0.002 ? 1 : 0}
        />
        <circle cx="68" cy="68" r="46" className="focus-core" />
      </svg>
      <div className="focus-time">
        <span className="focus-digits" role="timer" aria-label={up ? tr("{phase} : {time} écoulées", { phase: PHASE_LABELS[timer.phase], time: clock(shown) }) : tr("{phase} : {time} restantes", { phase: PHASE_LABELS[timer.phase], time: clock(shown) })}>
          {clock(shown)}
        </span>
        <span className="focus-caption">{caption ?? phaseCaption(timer)}</span>
      </div>
    </div>
  );
}

/** Démarrer, suspendre, reprendre ; arrêter ; passer à la phase suivante. */
export function FocusControls({ compact }: { compact?: boolean }) {
  const { timer, start, suspend, stop, skip } = useFocus();
  const running = timer.status === "en-cours";
  const begun = timer.status !== "arret";
  // Séance libre : « Pause » termine la séance et ouvre une pause du cinquième de sa durée.
  const flowPause = countsUp(timer) && begun;
  const skipLabel = flowPause ? tr("Faire une pause") : timer.phase === "concentration" ? tr("Passer à la pause") : tr("Passer la pause");
  return (
    <div className={compact ? "focus-controls focus-controls--compact" : "focus-controls"}>
      <button type="button" className="btn-gel focus-main" onClick={running ? suspend : start} data-sans-son>
        <Icon d={running ? ICONS.pause : ICONS.play} size={16} stroke={2.6} />
        {running ? tr("Suspendre") : timer.status === "suspendu" ? tr("Reprendre") : timer.phase === "concentration" ? tr("Démarrer") : tr("Démarrer la pause")}
      </button>
      <button
        type="button"
        className="btn-glass"
        onClick={stop}
        disabled={!begun && timer.phase === "concentration"}
        title={tr("Arrêter la séance")}
        aria-label={tr("Arrêter la séance")}
        data-sans-son
      >
        <Icon d={ICONS.stop} size={15} stroke={2.4} />
        {!compact && tr("Arrêter")}
      </button>
      <button
        type="button"
        className="btn-glass"
        onClick={skip}
        title={skipLabel}
        aria-label={skipLabel}
        data-sans-son
      >
        <Icon d={flowPause ? ICONS.pause : ICONS.skip} size={15} stroke={2.4} />
        {!compact && (flowPause ? tr("Pause") : tr("Passer"))}
      </button>
    </div>
  );
}
