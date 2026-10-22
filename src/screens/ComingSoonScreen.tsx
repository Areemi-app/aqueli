import { ModuleChip } from "../components/ModuleChip";
import { Orb } from "../components/Orb";
import { getModule, type ModuleKey } from "../modules/modules";
import { tr } from "../i18n/i18n";

interface ComingSoonProps {
  title: string;
  summary: string;
  color: string;
  icon: string;
  heading: string;
  features: readonly string[];
}

/** État vide illustré d'un écran pas encore construit (jamais un écran blanc). */
export function ComingSoon({ title, summary, color, icon, heading, features }: ComingSoonProps) {
  return (
    <div className="screen">
      <header className="screen-header">
        <ModuleChip color={color} icon={icon} size={40} />
        <div className="screen-heading">
          <h1 className="screen-title">{title}</h1>
          <p className="screen-subtitle">{summary}</p>
        </div>
      </header>
      <section className="coming-soon glass" aria-label={heading}>
        <Orb color={color} icon={icon} size={132} />
        <h2 className="coming-title">{heading}</h2>
        <ul className="feature-list">
          {features.map((f) => (
            <li key={f}>
              <span className="bullet-dot" aria-hidden="true" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function ModuleScreen({ moduleKey }: { moduleKey: ModuleKey }) {
  const m = getModule(moduleKey);
  return (
    <ComingSoon
      title={m.label}
      summary={m.summary}
      color={m.color}
      icon={m.icon}
      heading={tr("Bientôt disponible")}
      features={m.features}
    />
  );
}
