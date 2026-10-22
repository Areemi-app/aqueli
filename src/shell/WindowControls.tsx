import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { WINDOW_ICONS } from "../components/icons";
import { closeWindow, minimizeWindow, toggleMaximizeWindow, watchMaximized } from "../lib/windowControls";
import { tr } from "../i18n/i18n";

/** Réduire, Agrandir / Restaurer, Fermer : en haut à droite, comme toute fenêtre Windows. */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => watchMaximized(setMaximized), []);

  return (
    <div className="window-controls">
      <button type="button" className="window-btn" aria-label={tr("Réduire|fenêtre")} title={tr("Réduire|fenêtre")} onClick={minimizeWindow}>
        <Icon d={WINDOW_ICONS.minimize} grid={12} size={12} stroke={1.2} />
      </button>
      <button
        type="button"
        className="window-btn"
        aria-label={maximized ? tr("Restaurer") : tr("Agrandir")}
        title={maximized ? tr("Restaurer") : tr("Agrandir")}
        onClick={toggleMaximizeWindow}
      >
        <Icon d={maximized ? WINDOW_ICONS.restore : WINDOW_ICONS.maximize} grid={12} size={12} stroke={1.2} />
      </button>
      <button
        type="button"
        className="window-btn window-btn--close"
        aria-label={tr("Fermer")}
        title={tr("Fermer")}
        onClick={closeWindow}
      >
        <Icon d={WINDOW_ICONS.close} grid={12} size={12} stroke={1.2} />
      </button>
    </div>
  );
}
