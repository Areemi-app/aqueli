import { afterEach, describe, expect, it } from "vitest";
import { installTruncationTitles } from "./truncationTitles";

const sized = (el: HTMLElement, scroll: number, client: number) => {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scroll });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: client });
};

describe("infobulle des textes coupés", () => {
  let uninstall = () => {};
  afterEach(() => {
    uninstall();
    document.body.innerHTML = "";
  });

  it("montre le texte entier d'un libellé coupé, puis l'efface s'il tient de nouveau", () => {
    uninstall = installTruncationTitles();
    const el = document.createElement("span");
    el.style.textOverflow = "ellipsis";
    el.textContent = "Boîte de réception";
    document.body.append(el);
    sized(el, 200, 120);
    el.dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(el.title).toBe("Boîte de réception");
    sized(el, 120, 120);
    el.dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(el.hasAttribute("title")).toBe(false);
  });

  it("garde une infobulle écrite par l'interface", () => {
    uninstall = installTruncationTitles();
    const el = document.createElement("span");
    el.style.textOverflow = "ellipsis";
    el.title = "Ouvrir la liste";
    el.textContent = "Boîte de réception";
    document.body.append(el);
    sized(el, 200, 120);
    el.dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(el.title).toBe("Ouvrir la liste");
  });
});
