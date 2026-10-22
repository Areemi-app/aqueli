/**
 * Titre d'un écran de module : sa pastille brillante, de la couleur du module, puis son nom.
 * Chaque écran porte ainsi sa couleur dès le haut de la page, comme le Bilan et les Paramètres.
 */
import { getModule, type ModuleKey } from "../modules/modules";
import { ModuleChip } from "./ModuleChip";

export function ScreenTitle({ module, className = "tasks-title" }: { module: ModuleKey; className?: string }) {
  const m = getModule(module);
  return (
    <h1 className={`${className} screen-title-chip`}>
      <ModuleChip color={m.color} icon={m.icon} size={32} />
      <span>{m.label}</span>
    </h1>
  );
}
