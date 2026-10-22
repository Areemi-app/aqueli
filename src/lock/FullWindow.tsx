import type { ReactNode } from "react";
import { Decor } from "../shell/Decor";
import { WindowControls } from "../shell/WindowControls";

/**
 * Fond plein écran des écrans hors application (verrouillage, premier lancement) :
 * ciel du thème avec halo central, décor, et une fine barre pour déplacer la fenêtre.
 */
export function FullWindow({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fullwin">
      <Decor />
      <div className="fullwin-bar" data-tauri-drag-region="deep">
        <WindowControls />
      </div>
      <main className="fullwin-body">{children}</main>
      {footer}
    </div>
  );
}
