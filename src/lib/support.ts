/**
 * Soutien du projet : la page Ko-fi d'Areemi s'ouvre dans le navigateur de Windows (commande du
 * cœur à l'adresse fixe ; Aqueli ne se connecte à rien lui-même).
 */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./windowControls";

export const SUPPORT_URL = "https://ko-fi.com/areemi";

export function openSupport(): void {
  if (inTauri) void invoke("support_open").catch(() => {});
  else window.open(SUPPORT_URL, "_blank", "noopener");
}
