import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { searchSymbols, stripSymbols, SymbolPicker } from "./SymbolPicker";
import { SYMBOL_CATEGORIES, SYMBOLS } from "./symbols";

describe("bibliothèque de symboles", () => {
  it("range au moins 150 symboles en catégories, chacun avec un nom et un dessin", () => {
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(150);
    expect(SYMBOL_CATEGORIES.length).toBe(10);
    for (const c of SYMBOL_CATEGORIES) {
      expect(c.symbols.length).toBeGreaterThanOrEqual(7);
      expect(c.symbols.some((s) => s.id === c.icon)).toBe(true);
    }
    for (const s of SYMBOLS) {
      expect(s.label.trim()).not.toBe("");
      expect(s.path).toMatch(/^M/);
    }
  });

  it("trouve un symbole par son nom ou un synonyme, sans accents", () => {
    expect(searchSymbols("foot").map((s) => s.id)).toContain("ballon");
    expect(searchSymbols("epargne").map((s) => s.id)).toEqual(expect.arrayContaining(["tirelire", "banque"]));
    expect(searchSymbols("Théâtre").map((s) => s.id)).toEqual(["theatre"]);
    expect(searchSymbols("animal compagnie").map((s) => s.id)).toEqual(expect.arrayContaining(["chat", "chien"]));
    expect(searchSymbols("   ")).toEqual([]);
  });

  it("propose les récents, puis un symbole par catégorie, sans le symbole choisi", () => {
    expect(stripSymbols(["chat", "velo"], "chat").map((s) => s.id)).toEqual(["velo", "maison", "valise", "argent", "sante", "musique", "cafe"]);
  });
});

describe("sélecteur de symboles", () => {
  it("choisit dans la rangée, ou cherche dans le sélecteur complet", () => {
    const onChange = vi.fn();
    render(<SymbolPicker value="maison" onChange={onChange} label="Symbole de la liste" />);
    expect(screen.getByRole("radio", { name: "Maison", checked: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Travail" }));
    expect(onChange).toHaveBeenLastCalledWith("valise");

    fireEvent.click(screen.getByRole("button", { name: "Tous les symboles…" }));
    const search = screen.getByRole("textbox", { name: "Rechercher un symbole" });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "papillon" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("papillon");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
