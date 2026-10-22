/**
 * État vide d'une liste ou d'un panneau : bulle du module, une phrase, puis le bouton principal
 * de création au centre (« Nouvelle tâche », « Nouvelle note »…), le même dans tous les modules.
 */
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { Orb } from "./Orb";
import { Sentences } from "./Sentences";

interface EmptyStateProps {
  color: string;
  icon: string;
  text: string;
  /** Bouton de création ; sans lui, la phrase seule. */
  action?: { label: string; run: () => void };
  size?: number;
}

export function EmptyState({ color, icon, text, action, size = 72 }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Orb color={color} icon={icon} size={size} />
      <p className="empty-state-text">
        <Sentences text={text} />
      </p>
      {action && (
        <button type="button" className="btn-gel" onClick={action.run}>
          <Icon d={ICONS.plus} size={16} stroke={2.8} />
          {action.label}
        </button>
      )}
    </div>
  );
}
