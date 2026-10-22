/** Cartes de l'Accueil des Contacts, des Projets et des Listes. */
import { useId, useMemo, type CSSProperties } from "react";
import { Checkbox } from "../components/Checkbox";
import { useItemMenu } from "../components/ContextMenu";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Orb } from "../components/Orb";
import { symbolPath } from "../components/symbols";
import { contactName, sinceLabel, toReconnect, upcomingBirthdays, type Contact } from "../contacts/contacts";
import { useContacts } from "../contacts/ContactsProvider";
import { KEYS } from "../lib/itemKeys";
import { contactRequest, listRequest, NEW_ITEM, projectRequest } from "../lib/request";
import { useLists } from "../lists/ListsProvider";
import { getModule } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { HEALTH_LABELS, healthOf, progressOf } from "../projects/projects";
import { useProjects } from "../projects/ProjectsProvider";
import { formatShortDay } from "../tasks/day";
import { useTasks } from "../tasks/TasksProvider";
import { tr } from "../i18n/i18n";

const MAX_ROWS = 4;

/** Anniversaires des 14 prochains jours et contacts à recontacter. */
export function ContactsWidget() {
  const m = getModule("contacts");
  const { go } = useNavigation();
  const { visible, loaded } = useContacts();
  const { today } = useTasks();
  const itemMenu = useItemMenu();
  const headingId = useId();
  const birthdays = upcomingBirthdays(visible as Contact[], today, 14);
  const reconnect = toReconnect(visible, today);
  const open = (id: string) => {
    go("contacts");
    contactRequest.request(id);
  };
  const rows = [
    ...birthdays.map((b) => ({ id: b.contact.id, contact: b.contact, meta: (b.day === today ? tr("Anniversaire aujourd'hui") : tr("Anniversaire le {date}", { date: formatShortDay(b.day, today).replace(/\.$/, "") })) + (b.age ? tr(" · {age} ans", { age: b.age }) : ""), symbol: "cadeau" })),
    ...reconnect.map((c) => ({ id: c.id, contact: c, meta: c.lastContact ? tr("À recontacter · dernier échange {since}", { since: sinceLabel(c.lastContact, today) }) : tr("À recontacter"), symbol: "discussion" })),
  ];
  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Anniversaires et nouvelles")}
        </h2>
        <button type="button" className="link-btn" onClick={() => go("contacts")}>
          {m.label}
        </button>
      </div>
      {loaded && rows.length === 0 ? (
        <div className="widget-empty">
          <Orb color={m.color} icon={m.icon} size={64} />
          <p>{tr("Aucun anniversaire ces deux prochaines semaines, personne à recontacter.")}</p>
        </div>
      ) : (
        <ul className="widget-goals">
          {rows.slice(0, MAX_ROWS).map((r, i) => (
            <li key={`${r.id}-${i}`} style={{ "--goal-color": r.contact.color ?? m.color } as CSSProperties} {...itemMenu(() => [{ label: tr("Ouvrir la fiche"), icon: ICONS.enter, shortcut: KEYS.open, run: () => open(r.id) }])}>
              <button type="button" className="widget-goal" onClick={() => open(r.id)}>
                <ModuleChip color={r.contact.color ?? m.color} icon={symbolPath(r.symbol, ICONS.star)} size={30} />
                <span className="widget-goal-text">
                  <span className="widget-goal-title">{contactName(r.contact)}</span>
                  <span className="widget-goal-meta">{r.meta}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > MAX_ROWS && (
        <button type="button" className="link-btn today-more" onClick={() => go("contacts")}>
          {tr("{n} de plus", { n: rows.length - MAX_ROWS })}
        </button>
      )}
    </section>
  );
}

/** Projets en cours : avancement et état. */
export function ProjectsWidget() {
  const m = getModule("projets");
  const { go } = useNavigation();
  const { visible, milestones, loaded } = useProjects();
  const { tasks, today } = useTasks();
  const itemMenu = useItemMenu();
  const headingId = useId();
  const byProject = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) if (t.projectId) map.set(t.projectId, [...(map.get(t.projectId) ?? []), t]);
    return map;
  }, [tasks]);
  const active = visible.filter((p) => p.status === "en-cours" && !p.archived);
  const open = (id: string) => {
    go("projets");
    projectRequest.request(id);
  };
  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Projets en cours")}
        </h2>
        <button type="button" className="link-btn" onClick={() => go("projets")}>
          {m.label}
        </button>
      </div>
      {loaded && active.length === 0 ? (
        <div className="widget-empty">
          <Orb color={m.color} icon={m.icon} size={64} />
          <p>{tr("Aucun projet en cours.")}</p>
          <button type="button" className="link-btn" onClick={() => open(NEW_ITEM)}>
            {tr("Nouveau projet")}
          </button>
        </div>
      ) : (
        <ul className="widget-goals">
          {active.slice(0, MAX_ROWS).map((p) => {
            const list = byProject.get(p.id) ?? [];
            const ms = milestones.get(p.id) ?? [];
            const progress = progressOf(list, ms);
            const health = healthOf(p, list, ms, today);
            const color = p.color ?? m.color;
            return (
              <li key={p.id} style={{ "--goal-color": color } as CSSProperties} {...itemMenu(() => [{ label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: () => open(p.id) }])}>
                <button type="button" className="widget-goal" onClick={() => open(p.id)}>
                  <ModuleChip color={color} icon={symbolPath(p.icon, ICONS.flag)} size={30} />
                  <span className="widget-goal-text">
                    <span className="widget-goal-title">{p.name}</span>
                    <span className="widget-goal-meta">{progress.total ? tr("{percent} % · {done} sur {total}", { percent: progress.percent, done: progress.done, total: progress.total }) : tr("Aucune tâche")}</span>
                  </span>
                  {health && (
                    <span className="project-health project-health--widget" data-level={health.level} title={health.reasons.join(" · ")}>
                      {HEALTH_LABELS[health.level]}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Liste de courses : ce qui reste à acheter, à cocher d'ici. */
export function ShoppingWidget() {
  const m = getModule("listes");
  const { go } = useNavigation();
  const { visible, items, loaded, updateItem } = useLists();
  const headingId = useId();
  const list = visible.find((l) => l.template === "courses" && !l.archived) ?? null;
  const open = list ? (items.get(list.id) ?? []).filter((i) => !i.done) : [];
  const goList = () => {
    go("listes");
    if (list) listRequest.request(list.id);
  };
  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={list?.color ?? m.color} icon={list ? symbolPath(list.icon, m.icon) : m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {list?.name ?? tr("Liste de courses")}
        </h2>
        <button type="button" className="link-btn" onClick={goList}>
          {m.label}
        </button>
      </div>
      {loaded && open.length === 0 ? (
        <div className="widget-empty">
          <Orb color={m.color} icon={m.icon} size={64} />
          <p>{list ? tr("Rien à acheter.") : tr("Aucune liste de courses.")}</p>
          {!list && (
            <button type="button" className="link-btn" onClick={() => listRequest.request(NEW_ITEM)}>
              {tr("Nouvelle liste")}
            </button>
          )}
        </div>
      ) : (
        <ul className="widget-checks">
          {open.slice(0, 6).map((i) => (
            <li key={i.id}>
              <Checkbox checked={false} onChange={() => void updateItem(i, { done: true })} label={i.title} note={i.section ?? undefined} />
            </li>
          ))}
        </ul>
      )}
      {open.length > 6 && (
        <button type="button" className="link-btn today-more" onClick={goList}>
          {tr("{n} de plus", { n: open.length - 6 })}
        </button>
      )}
    </section>
  );
}
