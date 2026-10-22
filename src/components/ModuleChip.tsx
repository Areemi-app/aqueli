import type { CSSProperties } from "react";
import { Icon } from "./Icon";

interface ModuleChipProps {
  /** Couleur d'identité du module (ou une variable de thème). */
  color: string;
  icon: string;
  size?: number;
}

/** Pastille brillante colorée avec l'icône du module (maquette BarreLaterale). */
export function ModuleChip({ color, icon, size = 24 }: ModuleChipProps) {
  const style = { "--chip-color": color, "--chip-size": `${size}px` } as CSSProperties;
  return (
    <span className="chip" style={style} aria-hidden="true">
      <Icon d={icon} size={Math.round(size * 0.62)} stroke={2.3} />
    </span>
  );
}
