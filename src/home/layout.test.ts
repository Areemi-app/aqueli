import { describe, expect, it } from "vitest";
import {
  addLayout,
  activeLayout,
  cleanName,
  defaultLayouts,
  hiddenWidgets,
  hideWidget,
  moveWidget,
  nameTaken,
  removeLayout,
  renameLayout,
  sanitizeLayouts,
  setWidgetSize,
  showWidget,
} from "./layout";

const ids = (layout: { widgets: { id: string }[] }) => layout.widgets.map((w) => w.id);

describe("mise en page de l'Accueil", () => {
  it("reprend la maquette par défaut", () => {
    const l = defaultLayouts();
    expect(l.layouts).toHaveLength(1);
    expect(activeLayout(l).name).toBe("Principale");
    expect(ids(activeLayout(l))).toEqual(["aujourdhui", "rendez-vous", "obligations", "habitudes", "focus", "note"]);
    expect(hiddenWidgets(activeLayout(l))).toEqual(["a-venir", "humeur", "objectifs", "budget", "contacts", "projets", "courses"]);
  });

  it("déplace, agrandit, masque et remet une carte", () => {
    let layout = activeLayout(defaultLayouts());
    layout = moveWidget(layout, "focus", 0);
    expect(ids(layout).slice(0, 2)).toEqual(["focus", "aujourdhui"]);
    layout = moveWidget(layout, "focus", 99);
    expect(ids(layout).at(-1)).toBe("focus");
    layout = setWidgetSize(layout, "aujourdhui", "large");
    expect(layout.widgets[0]).toEqual({ id: "aujourdhui", size: "large" });
    layout = hideWidget(layout, "habitudes");
    expect(ids(layout)).not.toContain("habitudes");
    layout = showWidget(layout, "habitudes");
    expect(layout.widgets.at(-1)).toEqual({ id: "habitudes", size: "normal" });
    expect(showWidget(layout, "habitudes")).toBe(layout);
  });
});

describe("mises en page enregistrées", () => {
  it("en crée une à partir de celle affichée, qui devient active", () => {
    let l = defaultLayouts();
    l = { ...l, layouts: [{ ...activeLayout(l), widgets: [{ id: "focus", size: "haute" }] }] };
    l = addLayout(l, "Week-end", "we");
    expect(l.active).toBe("we");
    expect(activeLayout(l)).toEqual({ id: "we", name: "Week-end", widgets: [{ id: "focus", size: "haute" }] });
  });

  it("renomme et supprime, sans jamais retirer la dernière", () => {
    let l = addLayout(defaultLayouts(), "Travail", "tr");
    l = renameLayout(l, "tr", "Bureau");
    expect(activeLayout(l).name).toBe("Bureau");
    l = removeLayout(l, "tr");
    expect(l.layouts.map((x) => x.name)).toEqual(["Principale"]);
    expect(activeLayout(l).name).toBe("Principale");
    expect(removeLayout(l, l.active)).toBe(l);
  });

  it("nettoie les noms et repère les doublons", () => {
    expect(cleanName("  Week   end ")).toBe("Week end");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("x".repeat(50))).toHaveLength(30);
    const l = defaultLayouts();
    expect(nameTaken(l, "principale")).toBe(true);
    expect(nameTaken(l, "principale", l.active)).toBe(false);
  });

  it("répare une préférence abîmée", () => {
    expect(sanitizeLayouts(null)).toEqual(defaultLayouts());
    expect(sanitizeLayouts({ active: "x", layouts: [] })).toEqual(defaultLayouts());
    const fixed = sanitizeLayouts({
      active: "absente",
      layouts: [
        {
          id: "a",
          name: "  Travail ",
          widgets: [
            { id: "focus", size: "large" },
            { id: "focus", size: "normal" },
            { id: "inconnue", size: "normal" },
            { id: "note", size: "géante" },
          ],
        },
        { id: "a", name: "Doublon", widgets: [] },
      ],
    });
    expect(fixed).toEqual({
      active: "a",
      layouts: [
        {
          id: "a",
          name: "Travail",
          widgets: [
            { id: "focus", size: "large" },
            { id: "note", size: "normal" },
          ],
        },
      ],
    });
  });
});
