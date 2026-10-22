import { lang } from "../i18n/i18n";

/** Texte des données d'exemple de l'aperçu dans un navigateur : en français, en anglais dans toute autre langue. */
export const demo = (fr: string, en: string): string => (lang() === "fr" ? fr : en);
