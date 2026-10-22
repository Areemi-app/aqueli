import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { forgetUndo, isCollecting, isReplaying, popUndo, recordUndo, replay } from "./undo";
import { tr } from "../i18n/i18n";

interface ToastAction {
  label: string;
  run: () => void;
  /** Action que « Annuler » défait, pour Ctrl+Z et son message (« suppression de la tâche »). */
  undo?: string;
}

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  /** Numéro de l'action dans l'historique d'annulation. */
  undoId: number | null;
}

type Notify = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<Notify | null>(null);
const UndoContext = createContext<(() => Promise<void>) | null>(null);

/** Durée d'affichage ; 8 secondes quand un bouton « Annuler » est proposé (cahier des charges § 7). */
const DURATION = 3800;
const DURATION_WITH_ACTION = 8000;

/** « Tâche supprimée. » → « tâche supprimée ». */
const labelOf = (message: string) => message.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase());

/**
 * Petit message en bas de la fenêtre, qui disparaît seul, avec éventuellement une action. Un
 * bouton « Annuler » inscrit aussi l'action dans l'historique de Ctrl+Z (src/app/undo.ts).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /** Pendant une annulation : un message d'erreur a été montré. */
  const failedDuringUndo = useRef(false);

  const show = useCallback((next: Omit<Toast, "id">) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), ...next });
    timer.current = window.setTimeout(() => setToast(null), next.action ? DURATION_WITH_ACTION : DURATION);
  }, []);

  const notify = useCallback<Notify>(
    (message, action) => {
      if (isReplaying()) {
        // Une annulation ne propose pas d'annuler ; un autre message signale une erreur.
        if (action) return;
        failedDuringUndo.current = true;
      }
      // Action sur plusieurs éléments : un seul message, montré à la fin (src/app/bulk.ts).
      if (isCollecting() && action) {
        if (action.undo || action.label === tr("Annuler|action")) recordUndo(action.undo ?? labelOf(message), action.run);
        return;
      }
      const undoId = action && (action.undo || action.label === tr("Annuler|action")) ? recordUndo(action.undo ?? labelOf(message), action.run) : null;
      show({ message, action, undoId });
    },
    [show],
  );

  const undo = useCallback(async () => {
    const entry = popUndo();
    if (!entry) {
      show({ message: tr("Rien à annuler."), undoId: null });
      return;
    }
    // Le message de cette action disparaît : son bouton ne doit plus servir.
    setToast((current) => (current?.undoId === entry.id ? null : current));
    failedDuringUndo.current = false;
    await replay(entry.run);
    if (!failedDuringUndo.current) show({ message: tr("Annulé : {label}.", { label: entry.label }), undoId: null });
  }, [show]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={notify}>
      <UndoContext.Provider value={undo}>
        {children}
        <div className="toast-region" role="status" aria-live="polite">
          {toast && (
            <div key={toast.id} className="toast glass-popover">
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  className="toast-action"
                  title={toast.undoId !== null ? tr("Annuler (Ctrl+Z)") : undefined}
                  onClick={() => {
                    window.clearTimeout(timer.current);
                    setToast(null);
                    if (toast.undoId !== null) forgetUndo(toast.undoId);
                    const run = toast.action?.run;
                    if (run) void replay(run);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
        </div>
      </UndoContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé dans ToastProvider");
  return ctx;
}

/** Ctrl+Z : annule la dernière action. */
export function useUndoAction(): () => Promise<void> {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndoAction doit être utilisé dans ToastProvider");
  return ctx;
}
