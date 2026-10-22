/** Case du jour d'une habitude : partagée par l'écran Habitudes et l'Accueil (l'écran se charge à sa première ouverture). */
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import type { DayKey } from "../tasks/day";
import { isDoneOn, valueOn, type CheckIndex, type Habit } from "./habits";
import { useHabits } from "./HabitsProvider";
import { tr } from "../i18n/i18n";

/** Bouton du jour : case ronde (oui/non) ou compteur (quantité). */
export function HabitToday({ habit, day, checks }: { habit: Habit; day: DayKey; checks: CheckIndex }) {
  const { setValue, toggle } = useHabits();
  const value = valueOn(checks, habit.id, day);
  const done = isDoneOn(habit, checks, day);
  if (habit.kind === "quantite") {
    return (
      <span className="habit-counter" data-done={done || undefined}>
        <button type="button" className="habit-step" aria-label={tr("Retirer 1 : {name}", { name: habit.name })} disabled={value <= 0} onClick={() => void setValue(habit, day, value - 1)}>
          −
        </button>
        <span className="habit-count" aria-live="polite">
          {value}/{habit.target}
          {habit.unit ? <span className="habit-unit"> {habit.unit}</span> : null}
        </span>
        <button type="button" className="habit-step" aria-label={tr("Ajouter 1 : {name}", { name: habit.name })} onClick={() => void setValue(habit, day, value + 1)}>
          +
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="task-check habit-check"
      aria-pressed={done}
      aria-label={habit.negative ? tr("Jour tenu : {name}", { name: habit.name }) : tr("Fait : {name}", { name: habit.name })}
      title={habit.negative ? tr("Jour tenu") : tr("Fait")}
      onClick={() => void toggle(habit, day)}
    >
      {done && <Icon d={ICONS.check} size={14} stroke={3.4} />}
    </button>
  );
}
