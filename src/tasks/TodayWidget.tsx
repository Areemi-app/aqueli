import { useId, type CSSProperties } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Orb } from "../components/Orb";
import { writePref } from "../lib/storage";
import { getModule } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { relativeDay } from "./day";
import { doneDay, PRIORITY_LABELS, sortTasks, type Task } from "./tasks";
import { useTasks } from "./TasksProvider";
import { useTaskMenu } from "./taskMenu";
import { useItemMenu } from "../components/ContextMenu";
import { tr } from "../i18n/i18n";

/** Au plus, pour tenir dans la carte de l'Accueil. */
const MAX_ROWS = 6;

/** Tâches du jour : en retard ou prévues aujourd'hui, et celles terminées aujourd'hui. */
export function useTodayTasks(): { done: Task[]; open: Task[] } {
  const { visible, today } = useTasks();
  const open = sortTasks(visible.filter((t) => t.doneAt === null && t.dueDate !== null && t.dueDate <= today));
  const done = sortTasks(visible.filter((t) => doneDay(t) === today && (t.dueDate === null || t.dueDate <= today)));
  return { done, open };
}

/** Carte « Aujourd'hui » de l'Accueil (maquette Main.dc.html). */
export function TodayWidget() {
  const { today, setDone, loaded } = useTasks();
  const { spaces } = useSpaces();
  const { go } = useNavigation();
  const { done, open } = useTodayTasks();
  const itemMenu = useItemMenu();
  const taskMenu = useTaskMenu();
  const headingId = useId();
  const m = getModule("taches");
  const all = [...done, ...open];
  const total = all.length;
  const shown = all.slice(0, MAX_ROWS);

  const openTasks = () => {
    writePref("listeTaches", "aujourdhui");
    go("taches");
  };

  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Aujourd'hui")}
        </h2>
        <button type="button" className="link-btn" onClick={openTasks}>
          {tr("Tout voir")}
        </button>
      </div>
      {loaded && total === 0 ? (
        <div className="widget-empty">
          <Orb color={m.color} icon={m.icon} size={64} />
          <p>{tr("Aucune tâche pour aujourd'hui.")}</p>
        </div>
      ) : (
        <>
          <ul className="today-rows">
            {shown.map((t) => {
              const isDone = t.doneAt !== null;
              const late = !isDone && t.dueDate !== null && t.dueDate < today;
              const space = spaces.find((s) => s.id === t.spaceId);
              return (
                <li key={t.id} className="today-row" data-done={isDone || undefined} {...itemMenu(() => taskMenu(t))}>
                  <button
                    type="button"
                    className="task-check"
                    data-sans-son
                    aria-label={isDone ? tr("Rouvrir la tâche « {title} »", { title: t.title }) : tr("Terminer la tâche « {title} »", { title: t.title })}
                    onClick={() => void setDone(t, !isDone)}
                  >
                    {isDone && <Icon d={ICONS.check} size={12} stroke={3.5} />}
                  </button>
                  <button type="button" className="today-title" onClick={openTasks}>
                    {t.title}
                  </button>
                  {late && t.dueDate && <span className="task-meta" data-late>{relativeDay(t.dueDate, today)}</span>}
                  {t.dueTime && !late && <span className="pill today-time">{t.dueTime}</span>}
                  {t.priority > 0 && (
                    <span
                      className="task-flag"
                      data-priority={t.priority}
                      role="img"
                      aria-label={tr("Priorité {x}", { x: PRIORITY_LABELS[t.priority].toLowerCase() })}
                    >
                      <Icon d={ICONS.flag} size={14} filled />
                    </span>
                  )}
                  <span
                    className="space-dot"
                    style={{ "--space-color": space?.color ?? "transparent" } as CSSProperties}
                    aria-hidden="true"
                  />
                </li>
              );
            })}
          </ul>
          {total > MAX_ROWS && (
            <button type="button" className="link-btn today-more" onClick={openTasks}>
              {tr("{n} de plus", { n: total - MAX_ROWS })}
            </button>
          )}
          <div className="today-progress">
            <div
              className="today-bar"
              role="progressbar"
              aria-label={tr("Tâches du jour terminées")}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done.length}
            >
              <div className="today-bar-fill" style={{ width: `${total ? (100 * done.length) / total : 0}%` }} />
            </div>
            <span className="today-count">
              {tr("{done} sur {total}", { done: done.length, total })}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
