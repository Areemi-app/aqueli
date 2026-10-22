/**
 * Visite guidée : l'élément de l'étape est éclairé, le reste assombri, et une bulle explique.
 * « Suivant » (→ ou Entrée), « Précédent » (←), « Passer la visite » (Échap).
 *
 * La bulle d'une étape n'est affichée qu'une fois son élément trouvé et mesuré, avant que la
 * fenêtre ne soit redessinée : jamais le texte d'une étape à la place d'une autre.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveShortcuts } from "../app/shortcuts";
import { captureApi, hotkeyKeys } from "../capture/captureApi";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { fillShortcuts } from "../help/shortcutTokens";
import { useNavigation } from "../navigation/NavigationProvider";
import { usePreferences } from "../prefs/PreferencesProvider";
import { placeBubble, type Box } from "./placement";
import { tourOf, type TourId } from "./tours";
import { tr } from "../i18n/i18n";

/** Marge autour de l'élément éclairé. */
const PAD = 6;
/** Attente maximale d'un élément (écran chargé à la demande) ; au-delà, la bulle s'affiche au centre. */
const WAIT_MS = 1500;
/** Délai laissé à un écran chargé pour afficher l'élément (colonne masquée : la bulle va au centre). */
const GRACE_MS = 200;
/** Contrôle de la position de l'élément suivi (une seule mesure, pas de recherche). */
const FOLLOW_MS = 500;

/** Premier élément visible parmi les sélecteurs, dans leur ordre. */
function findTarget(selectors: readonly string[] | undefined): HTMLElement | null {
  for (const s of selectors ?? []) {
    for (const el of document.querySelectorAll<HTMLElement>(s)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && el.offsetParent !== null) return el;
    }
  }
  return null;
}

const boxOf = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect();
  // Bornée à la fenêtre : une colonne qui défile reste dans le cadre.
  const left = Math.max(r.left, 0);
  const top = Math.max(r.top, 0);
  return { left, top, width: Math.min(r.right, window.innerWidth) - left, height: Math.min(r.bottom, window.innerHeight) - top };
};

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1);

export function TourOverlay({ id, onClose }: { id: TourId; onClose: () => void }) {
  const tour = tourOf(id);
  const { route, go } = useNavigation();
  const { prefs } = usePreferences();
  const keys = resolveShortcuts(prefs.shortcuts);
  const [index, setIndex] = useState(0);
  /** Étape affichée : celle dont l'élément est trouvé (null pendant l'attente). */
  const [shown, setShown] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [bubble, setBubble] = useState({ width: 360, height: 200 });
  const [capture, setCapture] = useState<string | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const last = index === tour.steps.length - 1;

  // L'écran de la visite s'ouvre au début.
  useEffect(() => {
    if (route !== tour.route) go(tour.route);
    void captureApi
      .hotkey()
      .then((h) => setCapture(h ? hotkeyKeys(h).join("+") : null))
      .catch(() => setCapture(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Élément de l'étape : cherché avant l'affichage, attendu s'il n'est pas encore là, puis suivi.
  // Tant que l'écran de la visite n'est pas ouvert et chargé, rien n'est cherché : un élément de
  // l'écran précédent ne peut pas être éclairé par erreur.
  useLayoutEffect(() => {
    const target = tour.steps[index]!.target;
    const loading = () => route !== tour.route || document.querySelector('.screen[aria-busy="true"]') !== null;
    let el: HTMLElement | null = null;
    let frame = 0;
    let follow = 0;
    let giveUp = 0;
    let grace = 0;
    let observer: MutationObserver | null = null;
    let resize: ResizeObserver | null = null;

    const place = () => {
      if (el && !el.isConnected) el = findTarget(target);
      const next = el ? boxOf(el) : null;
      setBox((current) => (sameBox(current, next) ? current : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const show = () => {
      observer?.disconnect();
      window.clearTimeout(giveUp);
      window.clearTimeout(grace);
      if (el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        resize = new ResizeObserver(schedule);
        resize.observe(el);
      }
      place();
      setShown(index);
      follow = window.setInterval(place, FOLLOW_MS);
    };

    const look = () => {
      if (loading()) return false;
      el = findTarget(target);
      if (el || !target) {
        show();
        return true;
      }
      if (!grace) grace = window.setTimeout(show, GRACE_MS);
      return false;
    };
    if (!look()) {
      // Élément pas encore là : la bulle de l'étape précédente disparaît aussitôt.
      setShown(null);
      observer = new MutationObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(look);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      giveUp = window.setTimeout(show, WAIT_MS);
    }

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    return () => {
      observer?.disconnect();
      resize?.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(giveUp);
      window.clearTimeout(grace);
      window.clearInterval(follow);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
    };
  }, [tour, index, route]);

  // Taille de la bulle, mesurée avant d'être dessinée pour la placer au bon endroit.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (el) setBubble((b) => (b.width === el.offsetWidth && b.height === el.offsetHeight ? b : { width: el.offsetWidth, height: el.offsetHeight }));
  });

  useEffect(() => {
    if (shown !== null) nextRef.current?.focus();
  }, [shown]);

  const next = useCallback(() => (last ? onClose() : setIndex((i) => i + 1)), [last, onClose]);
  const previous = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Clavier : la visite répond avant le reste de la fenêtre.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") previous();
      else if (e.key === "Tab") {
        const buttons = [...(bubbleRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const to = buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length];
        to?.focus();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [next, previous, onClose]);

  const view = { width: window.innerWidth, height: window.innerHeight };
  const lit = box ? { left: box.left - PAD, top: box.top - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 } : null;
  // Sans élément, le trou se referme au centre : le voile couvre tout, sans saut.
  const spot = lit ?? { left: view.width / 2, top: view.height / 2, width: 0, height: 0 };
  const at = placeBubble(lit, bubble, view);
  const fill = (text: string) => fillShortcuts(text, keys, capture ?? tr("son raccourci (Paramètres › Clavier)"));
  const step = shown === null ? null : tour.steps[shown]!;

  return createPortal(
    <div className="tour-layer">
      {/* Voile en quatre bandes autour de l'élément éclairé. */}
      <div className="tour-shade" style={{ left: 0, top: 0, width: "100%", height: Math.max(0, spot.top) }} />
      <div className="tour-shade" style={{ left: 0, top: spot.top + spot.height, width: "100%", bottom: 0 }} />
      <div className="tour-shade" style={{ left: 0, top: spot.top, width: Math.max(0, spot.left), height: spot.height }} />
      <div className="tour-shade" style={{ left: spot.left + spot.width, top: spot.top, right: 0, height: spot.height }} />
      <div className="tour-spot" data-empty={lit ? undefined : true} style={{ left: spot.left, top: spot.top, width: spot.width, height: spot.height }} />
      {step && shown !== null && (
        <div
          key={shown}
          ref={bubbleRef}
          className="tour-bubble glass-popover"
          data-side={at.side}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-text"
          style={{ left: at.left, top: at.top }}
        >
          <div className="tour-head">
            <span className="tour-step">
              {tour.title} · {tr("Étape {n} sur {total}", { n: shown + 1, total: tour.steps.length })}
            </span>
            <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Fermer la visite")} title={tr("Fermer la visite")} onClick={onClose}>
              <Icon d={ICONS.close} size={14} stroke={2.4} />
            </button>
          </div>
          <h2 id="tour-title" className="tour-title">
            {step.title}
          </h2>
          <p id="tour-text" className="tour-text">
            {fill(step.text)}
          </p>
          <div className="tour-dots" aria-hidden="true">
            {tour.steps.map((_, i) => (
              <span key={i} className="tour-dot" data-current={i === shown || undefined} data-done={i < shown || undefined} />
            ))}
          </div>
          <div className="tour-actions">
            {shown < tour.steps.length - 1 && (
              <button type="button" className="link-btn tour-skip" onClick={onClose}>
                {tr("Passer la visite")}
              </button>
            )}
            <span className="tasks-header-spacer" />
            <button type="button" className="btn-glass btn-glass--sm" disabled={shown === 0} onClick={previous}>
              {tr("Précédent")}
            </button>
            <button ref={nextRef} type="button" className="btn-gel btn-gel--sm" onClick={next}>
              {shown === tour.steps.length - 1 ? tr("Terminer") : tr("Suivant")}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
