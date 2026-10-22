/** Avancement d'un objectif (anneau et calcul), partagé par l'écran Objectifs et le Bilan. */
import type { CSSProperties, ReactNode } from "react";
import { isDoneOn } from "../habits/habits";
import { useHabits } from "../habits/HabitsProvider";
import { linkedTo } from "../links/links";
import { useLinks } from "../links/LinksProvider";
import { useTasks } from "../tasks/TasksProvider";
import { progressOf, type Goal, type Progress, type ProgressInput } from "./goals";
import { useGoals } from "./GoalsProvider";

/** Avancement d'un objectif, avec ses saisies, étapes, tâches liées ou habitude. */
export function useGoalProgress(): (goal: Goal) => Progress {
  const inputOf = useGoalInputs();
  return (goal) => progressOf(goal, inputOf(goal));
}

/** Ce qui fait avancer un objectif : saisies, étapes, tâches liées, habitude. */
export function useGoalInputs(): (goal: Goal) => ProgressInput {
  const { steps, entries } = useGoals();
  const { links } = useLinks();
  const { tasks, olderDone, today } = useTasks();
  const { habits, checks } = useHabits();
  return (goal) => {
    // Une tâche terminée il y a plus de 30 jours n'est plus chargée : elle compte comme faite.
    const linkedTasks = linkedTo(links, { kind: "goal", id: goal.id })
      .filter((r) => r.kind === "task")
      .map((r) => {
        const t = tasks.find((x) => x.id === r.id);
        if (t) return { done: t.doneAt !== null };
        return olderDone.some((x) => x.id === r.id) ? { done: true } : null;
      })
      .filter((t) => t !== null);
    const habit = habits.find((h) => h.id === goal.habitId);
    return {
      steps: steps.get(goal.id) ?? [],
      entries: entries.get(goal.id) ?? [],
      tasks: linkedTasks,
      habitDone: habit ? (day) => isDoneOn(habit, checks, day) : undefined,
      today,
    };
  };
}

export function Ring({ ratio, color, size, children }: { ratio: number; color: string; size: number; children?: ReactNode }) {
  const r = 15.9155;
  return (
    <span className="goal-ring" style={{ width: size, height: size, "--goal-color": color } as CSSProperties}>
      <svg viewBox="0 0 42 42" width={size} height={size} aria-hidden="true">
        <circle cx="21" cy="21" r={r} className="goal-ring-track" />
        <circle cx="21" cy="21" r={r} className="goal-ring-value" strokeDasharray={`${Math.max(0.01, ratio * 100)} ${100 - ratio * 100}`} strokeDashoffset={25} />
      </svg>
      <span className="goal-ring-center">{children ?? `${Math.round(ratio * 100)} %`}</span>
    </span>
  );
}

