/**
 * Choix de la langue, là où l'on démarre (écran d'accueil, déverrouillage) : un globe et la liste
 * des langues, chacune écrite dans sa propre langue. La fenêtre se recharge dans la langue choisie.
 */
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { Select } from "./Select";
import { lang, LANGUAGES, setLanguage, tr, type Lang } from "../i18n/i18n";

export function LanguagePicker({ className }: { className?: string }) {
  return (
    <div className={className ? `language-picker ${className}` : "language-picker"}>
      <Icon d={ICONS.globe} size={15} stroke={2.2} />
      <Select<Lang> value={lang()} options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} label={tr("Langue")} onChange={(v) => void setLanguage(v)} />
    </div>
  );
}
