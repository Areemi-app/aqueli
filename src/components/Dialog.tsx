import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { DialogMotif } from "./DialogMotif";
import { DIALOG_MOTIFS, motifFor, type DialogMotifKind } from "../theme/dialogDecor";
import { Icon } from "./Icon";
import { WINDOW_ICONS } from "./icons";
import { tr } from "../i18n/i18n";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Classe ajoutée à la fenêtre (« dialog--wide » pour une grande fenêtre). */
  className?: string;
  /** Un clic en dehors ferme la fenêtre (sauf pour un réglage en cours, comme l'éditeur de thème). */
  closeOnOutside?: boolean;
  /** Décor du coin en haut à droite ; par défaut, tiré du titre (toujours le même pour une fenêtre). */
  motif?: DialogMotifKind;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/** Motifs de fenêtre du thème affiché (posés par applyTheme). */
function themeMotifs(): readonly DialogMotifKind[] {
  const listed = (document.documentElement.dataset.decor ?? "").split(" ");
  const motifs = DIALOG_MOTIFS.filter((m) => listed.includes(m));
  return motifs.length > 0 ? motifs : DIALOG_MOTIFS;
}

/** Fenêtre de dialogue en verre. Échap la ferme ; Tab reste à l'intérieur. */
export function Dialog({ title, onClose, children, className, closeOnOutside = true, motif }: DialogProps) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // L'élément marqué « data-autofocus », sinon le premier champ de saisie, sinon le premier bouton.
    const box = boxRef.current;
    const first =
      box?.querySelector<HTMLElement>("[data-autofocus]") ??
      box?.querySelector<HTMLElement>("input:not([disabled])") ??
      box?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !boxRef.current) return;
    const items = [...boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="scrim scrim--center" onPointerDown={(e) => closeOnOutside && e.target === e.currentTarget && onClose()}>
      <div
        ref={boxRef}
        className={className ? `dialog glass-popover ${className}` : "dialog glass-popover"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onScroll={(e) => e.currentTarget.toggleAttribute("data-scrolled", e.currentTarget.scrollTop > 0)}
      >
        <DialogMotif kind={motif ?? motifFor(title, themeMotifs())} />
        <div className="dialog-head">
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Fermer")} title={tr("Fermer (Échap)")} onClick={onClose}>
            <Icon d={WINDOW_ICONS.close} grid={12} size={12} stroke={1.4} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
