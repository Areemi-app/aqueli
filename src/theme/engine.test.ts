import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_SETTINGS,
  EMPTY_ROTATION,
  HISTORY_SIZE,
  easterSunday,
  holidayTheme,
  isNight,
  periodKey,
  resolveTheme,
  seasonTheme,
  surprise,
  type ResolveContext,
  type ThemeSettings,
} from "./engine";

const AVAILABLE = [
  { id: "aqua", dark: false },
  { id: "nuit-etoilee", dark: true },
];

/** Date locale : d(2026, 9, 28, 14) = 28 septembre 2026 à 14 h. */
const d = (y: number, m: number, day: number, h = 12, min = 0) => new Date(y, m - 1, day, h, min);

function ctx(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    now: d(2026, 9, 28, 14),
    available: AVAILABLE,
    windowsDark: false,
    mood: null,
    rotation: EMPTY_ROTATION,
    launchId: "lancement-1",
    random: () => 0,
    ...overrides,
  };
}

function settings(overrides: Partial<ThemeSettings> = {}): ThemeSettings {
  return structuredClone({ ...DEFAULT_THEME_SETTINGS, ...overrides });
}

describe("calendrier des thèmes", () => {
  it("calcule le dimanche de Pâques", () => {
    expect(easterSunday(2024).toDateString()).toBe(d(2024, 3, 31).toDateString());
    expect(easterSunday(2025).toDateString()).toBe(d(2025, 4, 20).toDateString());
    expect(easterSunday(2026).toDateString()).toBe(d(2026, 4, 5).toDateString());
    expect(easterSunday(2027).toDateString()).toBe(d(2027, 3, 28).toDateString());
  });

  it("reconnaît les fêtes", () => {
    expect(holidayTheme(d(2026, 12, 1))).toBe("noel");
    expect(holidayTheme(d(2026, 12, 25))).toBe("noel");
    expect(holidayTheme(d(2026, 12, 26))).toBe("nouvel-an");
    expect(holidayTheme(d(2027, 1, 2))).toBe("nouvel-an");
    expect(holidayTheme(d(2027, 1, 3))).toBeNull();
    expect(holidayTheme(d(2027, 2, 7))).toBe("saint-valentin");
    expect(holidayTheme(d(2027, 2, 14))).toBe("saint-valentin");
    expect(holidayTheme(d(2027, 2, 15))).toBeNull();
    expect(holidayTheme(d(2026, 10, 24))).toBe("halloween");
    expect(holidayTheme(d(2026, 10, 31))).toBe("halloween");
    expect(holidayTheme(d(2026, 11, 1))).toBeNull();
  });

  it("compte la semaine de Pâques du lundi précédent au lundi de Pâques", () => {
    expect(holidayTheme(d(2026, 3, 29))).toBeNull();
    expect(holidayTheme(d(2026, 3, 30))).toBe("paques");
    expect(holidayTheme(d(2026, 4, 5))).toBe("paques");
    expect(holidayTheme(d(2026, 4, 6))).toBe("paques");
    expect(holidayTheme(d(2026, 4, 7))).toBeNull();
  });

  it("change de saison aux dates prévues", () => {
    expect(seasonTheme(d(2026, 3, 19))).toBe("hiver");
    expect(seasonTheme(d(2026, 3, 20))).toBe("printemps");
    expect(seasonTheme(d(2026, 6, 20))).toBe("printemps");
    expect(seasonTheme(d(2026, 6, 21))).toBe("ete");
    expect(seasonTheme(d(2026, 9, 22))).toBe("ete");
    expect(seasonTheme(d(2026, 9, 23))).toBe("automne");
    expect(seasonTheme(d(2026, 12, 20))).toBe("automne");
    expect(seasonTheme(d(2026, 12, 21))).toBe("hiver");
    expect(seasonTheme(d(2027, 1, 15))).toBe("hiver");
  });

  it("la nuit commence à 21 h et finit à 7 h", () => {
    expect(isNight(d(2026, 9, 28, 20, 59))).toBe(false);
    expect(isNight(d(2026, 9, 28, 21, 0))).toBe(true);
    expect(isNight(d(2026, 9, 29, 6, 59))).toBe(true);
    expect(isNight(d(2026, 9, 29, 7, 0))).toBe(false);
  });

  it("découpe le temps selon la fréquence de rotation", () => {
    expect(periodKey("jour", d(2026, 9, 28), "x")).toBe("jour:2026-09-28");
    expect(periodKey("mois", d(2026, 9, 28), "x")).toBe("mois:2026-09");
    expect(periodKey("ouverture", d(2026, 9, 28), "lancement-7")).toBe("ouverture:lancement-7");
    // Le 1er janvier 2027 (vendredi) appartient encore à la semaine 53 de 2026.
    expect(periodKey("semaine", d(2026, 12, 31), "x")).toBe("semaine:2026-53");
    expect(periodKey("semaine", d(2027, 1, 1), "x")).toBe("semaine:2026-53");
    expect(periodKey("semaine", d(2027, 1, 4), "x")).toBe("semaine:2027-1");
  });
});

describe("priorités du moteur de thèmes", () => {
  it("affiche le thème préféré par défaut", () => {
    expect(resolveTheme(settings({ fixed: "nuit-etoilee" }), ctx())).toMatchObject({
      theme: "nuit-etoilee",
      reason: "prefere",
    });
  });

  it("se rabat sur un thème disponible si le préféré ne l'est pas", () => {
    expect(resolveTheme(settings({ fixed: "automne" }), ctx()).theme).toBe("aqua");
  });

  it("passe en Nuit étoilée après 21 h si la règle est active", () => {
    const s = settings();
    s.auto.enabled = true;
    expect(resolveTheme(s, ctx({ now: d(2026, 9, 28, 22) }))).toMatchObject({ theme: "nuit-etoilee", reason: "nuit" });
    expect(resolveTheme(s, ctx({ now: d(2026, 9, 28, 10) }))).toMatchObject({ theme: "aqua", reason: "prefere" });
    s.auto.night = false;
    expect(resolveTheme(s, ctx({ now: d(2026, 9, 28, 22) })).theme).toBe("aqua");
  });

  it("passe en Minuit, le pendant sombre, quand le thème préféré est de la famille Signature", () => {
    const s = settings();
    s.auto.enabled = true;
    const withMinuit = { available: [...ctx().available, { id: "minuit" as const, dark: true }] };
    expect(resolveTheme(s, ctx({ now: d(2026, 9, 28, 22), ...withMinuit }))).toMatchObject({ theme: "minuit", reason: "nuit" });
    s.fixed = "prairie";
    expect(resolveTheme(s, ctx({ now: d(2026, 9, 28, 22), ...withMinuit })).theme).toBe("nuit-etoilee");
  });

  it("ignore les règles automatiques quand le mode est coupé", () => {
    expect(resolveTheme(settings(), ctx({ now: d(2026, 9, 28, 23) })).theme).toBe("aqua");
  });

  it("suit le mode sombre de Windows si demandé", () => {
    const s = settings();
    s.auto.enabled = true;
    s.auto.windowsDark = true;
    expect(resolveTheme(s, ctx({ windowsDark: true }))).toMatchObject({
      theme: "nuit-etoilee",
      reason: "windows-sombre",
    });
    expect(resolveTheme(s, ctx({ windowsDark: false })).theme).toBe("aqua");
  });

  it("ignore une fête ou une saison dont le thème n'est pas encore disponible", () => {
    const s = settings();
    s.auto.enabled = true;
    expect(resolveTheme(s, ctx({ now: d(2026, 12, 24, 10) }))).toMatchObject({ theme: "aqua", reason: "prefere" });
    expect(resolveTheme(s, ctx({ now: d(2026, 12, 24, 22) })).reason).toBe("nuit");
  });

  it("utilise la fête, l'humeur ou la saison quand leur thème existe", () => {
    const s = settings();
    s.auto.enabled = true;
    const withAll = [...AVAILABLE, { id: "noel", dark: true }, { id: "zen", dark: false }, { id: "automne", dark: false }];
    expect(resolveTheme(s, ctx({ available: withAll, now: d(2026, 12, 24, 22) })).theme).toBe("noel");
    expect(resolveTheme(s, ctx({ available: withAll, mood: "calme", now: d(2026, 10, 5, 22) })).theme).toBe("zen");
    expect(resolveTheme(s, ctx({ available: withAll, now: d(2026, 10, 5, 10) }))).toMatchObject({
      theme: "automne",
      reason: "saison",
    });
  });

  it("le planning passe avant les règles automatiques", () => {
    const s = settings();
    s.auto.enabled = true;
    s.planning.enabled = true;
    s.planning.weekdays[0] = "aqua"; // lundi
    const mondayNight = d(2026, 9, 28, 22);
    expect(resolveTheme(s, ctx({ now: mondayNight }))).toMatchObject({ theme: "aqua", reason: "planning-jour" });
    // Mardi : pas de règle de planning, la nuit reprend la main.
    expect(resolveTheme(s, ctx({ now: d(2026, 9, 29, 22) })).reason).toBe("nuit");
  });

  it("une période datée passe avant le jour de la semaine", () => {
    const s = settings();
    s.planning.enabled = true;
    s.planning.weekdays[0] = "aqua";
    s.planning.periods = [{ id: "p", start: "2026-09-25", end: "2026-09-30", theme: "nuit-etoilee" }];
    expect(resolveTheme(s, ctx())).toMatchObject({ theme: "nuit-etoilee", reason: "planning-periode" });
    expect(resolveTheme(s, ctx({ now: d(2026, 10, 5) })).reason).toBe("planning-jour");
  });

  it("le planning coupé n'a aucun effet", () => {
    const s = settings();
    s.planning.weekdays[0] = "nuit-etoilee";
    expect(resolveTheme(s, ctx()).theme).toBe("aqua");
  });

  it("« Garder ce thème aujourd'hui » passe avant tout, jusqu'à minuit", () => {
    const s = settings({ forcedToday: { date: "2026-09-28", theme: "nuit-etoilee" } });
    s.planning.enabled = true;
    s.planning.weekdays[0] = "aqua";
    expect(resolveTheme(s, ctx())).toMatchObject({ theme: "nuit-etoilee", reason: "aujourdhui" });
    expect(resolveTheme(s, ctx({ now: d(2026, 9, 29, 0, 1) })).reason).not.toBe("aujourdhui");
  });
});

describe("rotation aléatoire", () => {
  function rotating(frequency: ThemeSettings["rotation"]["frequency"] = "jour"): ThemeSettings {
    const s = settings();
    s.rotation.enabled = true;
    s.rotation.frequency = frequency;
    return s;
  }

  it("tire un thème et le garde pendant la période", () => {
    const s = rotating();
    const first = resolveTheme(s, ctx());
    expect(first.reason).toBe("rotation");
    const again = resolveTheme(s, ctx({ rotation: first.rotation, random: () => 0.99 }));
    expect(again.theme).toBe(first.theme);
    expect(again.rotation).toBe(first.rotation);
  });

  it("ne montre jamais deux fois de suite le même thème", () => {
    const s = rotating();
    let rotation = EMPTY_ROTATION;
    let previous: string | null = null;
    for (let day = 1; day <= 30; day++) {
      const r = resolveTheme(s, ctx({ now: d(2026, 10, day), rotation, random: () => 0 }));
      expect(r.theme).not.toBe(previous);
      previous = r.theme;
      rotation = r.rotation;
    }
  });

  it("change à chaque ouverture si demandé", () => {
    const s = rotating("ouverture");
    const first = resolveTheme(s, ctx({ launchId: "a" }));
    const second = resolveTheme(s, ctx({ launchId: "b", rotation: first.rotation }));
    expect(second.theme).not.toBe(first.theme);
  });

  it("respecte la sélection de thèmes", () => {
    const s = rotating();
    s.rotation.pool = "clairs";
    let rotation = EMPTY_ROTATION;
    for (let day = 1; day <= 5; day++) {
      const r = resolveTheme(s, ctx({ now: d(2026, 10, day), rotation }));
      expect(r.theme).toBe("aqua");
      rotation = r.rotation;
    }
    s.rotation.pool = "selection";
    s.rotation.selection = [];
    // Sélection vide : tous les thèmes restent possibles.
    expect(["aqua", "nuit-etoilee"]).toContain(resolveTheme(s, ctx()).theme);
  });

  it("garde un historique des 10 derniers thèmes, le plus récent en tête", () => {
    const s = rotating();
    let rotation = EMPTY_ROTATION;
    for (let day = 1; day <= 15; day++) {
      rotation = resolveTheme(s, ctx({ now: d(2026, 10, day), rotation })).rotation;
    }
    expect(rotation.history).toHaveLength(HISTORY_SIZE);
    expect(rotation.history[0]?.date).toBe("2026-10-15");
  });

  it("passe avant les saisons, mais après la nuit", () => {
    const s = rotating();
    s.auto.enabled = true;
    s.auto.night = true;
    const withSeason = [...AVAILABLE, { id: "automne", dark: false }];
    expect(resolveTheme(s, ctx({ available: withSeason })).reason).toBe("rotation");
    expect(resolveTheme(s, ctx({ available: withSeason, now: d(2026, 9, 28, 23) })).reason).toBe("nuit");
  });

  it("ne tire jamais un thème de fête ou de saison, sauf s'il est sélectionné", () => {
    const s = rotating();
    const dated = [...AVAILABLE, { id: "nouvel-an", dark: true }, { id: "noel", dark: false }, { id: "hiver", dark: false }];
    let rotation = EMPTY_ROTATION;
    for (let day = 1; day <= 20; day++) {
      const r = resolveTheme(s, ctx({ now: d(2026, 10, day), available: dated, rotation, random: () => (day % 5) / 5 }));
      expect(["aqua", "nuit-etoilee"]).toContain(r.theme);
      rotation = r.rotation;
    }
    expect(surprise(s, ctx({ available: dated, random: () => 0.99 }), "aqua").theme).toBe("nuit-etoilee");
    s.rotation.pool = "selection";
    s.rotation.selection = ["nouvel-an"];
    expect(resolveTheme(s, ctx({ available: dated })).theme).toBe("nouvel-an");
  });

  it("« Surprends-moi » tire un thème différent de celui affiché", () => {
    const s = rotating();
    const next = surprise(s, ctx({ random: () => 0 }), "aqua");
    expect(next.theme).toBe("nuit-etoilee");
    expect(next.history[0]?.theme).toBe("nuit-etoilee");
  });
});
