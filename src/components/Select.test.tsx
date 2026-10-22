import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { matchTyped, nextEnabled, pageFrom, Select, type SelectOption } from "./Select";

const COUNTRIES: SelectOption<string>[] = [
  { value: "aucun", label: "Aucun jour férié" },
  { value: "fr", label: "France métropolitaine", group: "France" },
  { value: "re", label: "La Réunion", group: "France" },
  { value: "be", label: "Belgique", group: "Europe" },
  { value: "lu", label: "Luxembourg", group: "Europe", disabled: true },
  { value: "es", label: "Espagne", group: "Europe" },
  { value: "et", label: "États-Unis", group: "Amérique du Nord" },
];

function Harness({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("fr");
  return (
    <Select
      value={value}
      options={COUNTRIES}
      label="Pays"
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

const box = () => screen.getByRole("combobox", { name: "Pays" });
const key = (k: string) => fireEvent.keyDown(box(), { key: k });

describe("liste déroulante d'Aqueli", () => {
  it("montre la valeur choisie et ouvre une liste en groupes", () => {
    render(<Harness />);
    expect(box().getAttribute("aria-expanded")).toBe("false");
    expect(box().querySelector("[data-shown]")?.textContent).toBe("France métropolitaine");
    fireEvent.click(box());
    expect(box().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual([null, "France", "Europe", "Amérique du Nord"]);
    expect(screen.getByRole("option", { selected: true }).textContent).toBe("France métropolitaine");
  });

  it("se parcourt au clavier en sautant les options indisponibles, puis choisit", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    key("ArrowDown");
    const active = () => document.getElementById(box().getAttribute("aria-activedescendant") ?? "")?.textContent;
    expect(active()).toBe("France métropolitaine");
    key("ArrowDown");
    key("ArrowDown");
    key("ArrowDown");
    expect(active()).toBe("Espagne");
    key("Enter");
    expect(onChange).toHaveBeenCalledWith("es");
    expect(box().getAttribute("aria-expanded")).toBe("false");
  });

  it("ferme sans rien changer avec Échap, sans fermer la fenêtre autour", () => {
    const onChange = vi.fn();
    const parent = vi.fn();
    render(
      <div onKeyDown={parent}>
        <Harness onChange={onChange} />
      </div>,
    );
    key("ArrowDown");
    key("End");
    key("Escape");
    expect(onChange).not.toHaveBeenCalled();
    expect(parent).not.toHaveBeenCalled();
    expect(box().getAttribute("aria-expanded")).toBe("false");
  });

  it("va à l'option qui commence par les lettres saisies, sans tenir compte des accents", () => {
    expect(matchTyped(COUNTRIES, "e", 1)).toBe(5);
    expect(matchTyped(COUNTRIES, "e", 5)).toBe(6);
    expect(matchTyped(COUNTRIES, "eta", 0)).toBe(6);
    expect(matchTyped(COUNTRIES, "l", 0)).toBe(2);
    expect(matchTyped(COUNTRIES, "z", 0)).toBe(-1);
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    key("b");
    key("Enter");
    expect(onChange).toHaveBeenCalledWith("be");
  });

  it("calcule les déplacements de début, de fin et de page", () => {
    expect(nextEnabled(COUNTRIES, 3, 1)).toBe(5);
    expect(nextEnabled(COUNTRIES, 6, 1)).toBe(6);
    expect(pageFrom(COUNTRIES, 0, 10)).toBe(6);
    expect(pageFrom(COUNTRIES, 6, -10)).toBe(0);
  });
});
