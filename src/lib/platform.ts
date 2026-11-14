/**
 * Système sur lequel tourne Aqueli. Sous Linux, les textes qui parlent de Windows (verrouillage,
 * mode sombre, lancement avec la session) ont leur variante, et Windows Hello disparaît.
 * L'aperçu du navigateur reste à la Windows ; en développement, la préférence d'aperçu
 * « aqueli-apercu.plateforme » à « linux » montre la variante Linux.
 */
import { inTauri } from "./windowControls";

function detect(): boolean {
  if (inTauri) return typeof navigator !== "undefined" && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem("aqueli-apercu.plateforme") === "linux";
  } catch {
    return false;
  }
}

export const isLinux = detect();
