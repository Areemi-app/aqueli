import { describe, expect, it } from "vitest";
import { needsEllipsisDirection } from "./ellipsisDirection";

const WEBKIT_GTK = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15";
const WEBVIEW2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";

describe("needsEllipsisDirection", () => {
  it("ne vaut que de droite à gauche, dans WebKit", () => {
    expect(needsEllipsisDirection(true, WEBKIT_GTK)).toBe(true);
    expect(needsEllipsisDirection(false, WEBKIT_GTK)).toBe(false);
    expect(needsEllipsisDirection(true, WEBVIEW2)).toBe(false);
  });
});
