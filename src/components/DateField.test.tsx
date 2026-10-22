import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { addDays, dayKey } from "../tasks/day";
import { DateField, formatDateField, quickDays, readDate } from "./DateField";
import { durationLabel, readTime, TimeField, timeChoices } from "./TimeField";

const today = dayKey(new Date());

function DateHarness({ onChange, clearable }: { onChange: (v: string) => void; clearable?: boolean }) {
  const [value, setValue] = useState<string>(today);
  return (
    <DateField
      label="Échéance"
      value={value}
      clearable={clearable}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe("champ de date", () => {
  it("lit une date saisie en mots ou en chiffres", () => {
    expect(readDate("2026-10-09", "2026-10-09")).toBe("2026-10-09");
    expect(readDate("demain", "2026-10-09")).toBe("2026-10-10");
    expect(readDate("15/11", "2026-10-09")).toBe("2026-11-15");
    expect(readDate("n'importe quoi", "2026-10-09")).toBeNull();
  });

  it("écrit la date courte, avec l'année quand ce n'est pas l'année en cours", () => {
    expect(formatDateField("2026-10-09", "2026-10-01")).toBe("ven. 9 oct.");
    expect(formatDateField("2027-01-04", "2026-10-01")).toBe("4 janv. 2027");
  });

  it("propose aujourd'hui, demain, lundi prochain et dans une semaine", () => {
    expect(quickDays("2026-10-09").map((q) => q.day)).toEqual(["2026-10-09", "2026-10-10", "2026-10-12", "2026-10-16"]);
    expect(quickDays("2026-10-12")[2]!.day).toBe("2026-10-19");
  });

  it("valide la date saisie avec Entrée, et revient à l'ancienne si elle est illisible", () => {
    const onChange = vi.fn();
    render(<DateHarness onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Échéance" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "demain" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(addDays(today, 1));
    fireEvent.change(input, { target: { value: "xyz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input.value).toBe(formatDateField(addDays(today, 1), today));
  });

  it("ouvre le calendrier au clavier, se déplace jour par jour et choisit", () => {
    const onChange = vi.fn();
    render(<DateHarness onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Échéance" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    const grid = screen.getByRole("dialog").querySelector(".date-grid")!;
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(addDays(today, 8));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("retire la date avec « Aucune date » quand le champ le permet", () => {
    const onChange = vi.fn();
    render(<DateHarness onChange={onChange} clearable />);
    fireEvent.click(screen.getByRole("combobox", { name: "Échéance" }));
    fireEvent.click(screen.getByRole("button", { name: "Aucune date" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("champ d'heure", () => {
  it("lit les heures saisies de plusieurs façons", () => {
    expect(readTime("14h30")).toBe("14:30");
    expect(readTime("9")).toBe("09:00");
    expect(readTime("1830")).toBe("18:30");
    expect(readTime("7:5")).toBe("07:05");
    expect(readTime("midi")).toBe("12:00");
    expect(readTime("25h")).toBeNull();
  });

  it("propose les quarts d'heure, et la durée après une heure de début", () => {
    expect(timeChoices(15)).toHaveLength(96);
    const after = timeChoices(15, "14:00");
    expect(after[0]).toEqual({ time: "14:15", note: "15 min" });
    expect(after[3]).toEqual({ time: "15:00", note: "1 h" });
    expect(after[5]).toEqual({ time: "15:30", note: "1 h 30" });
    expect(durationLabel(135)).toBe("2 h 15");
  });

  it("choisit une heure dans la liste au clavier", () => {
    const onChange = vi.fn();
    render(<TimeField label="Heure" value="09:00" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Heure" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("09:15");
  });
});
