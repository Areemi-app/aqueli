/** Ouvrir les Paramètres sur une page donnée, depuis n'importe où (léger : les Paramètres se chargent à leur ouverture). */
import { writePref } from "../lib/storage";
import type { SettingsTab } from "./settingsIndex";

export type { SettingsTab } from "./settingsIndex";

export const SETTINGS_TAB_EVENT = "aqueli:onglet-parametres";

/** Choisit l'onglet des Paramètres : à la prochaine ouverture, ou tout de suite s'ils sont affichés. */
export function preselectSettingsTab(tab: SettingsTab): void {
  writePref("ongletParametres", tab);
  window.dispatchEvent(new CustomEvent<SettingsTab>(SETTINGS_TAB_EVENT, { detail: tab }));
}
