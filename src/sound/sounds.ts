import { tr } from "../i18n/i18n";
/**
 * Sons d'Aqueli, créés par synthèse (Web Audio) : aucun fichier, aucune reprise de sons
 * existants. Chaque thème a sa couleur sonore (cahier des charges § 6).
 */

export type SoundName = "clic" | "bulle" | "carillon" | "deverrouillage" | "verrouillage" | "ouverture";
export type SoundCategory = "interface" | "achevement" | "notifications" | "ambiance";

export const SOUND_CATEGORY: Record<SoundName, SoundCategory> = {
  clic: "interface",
  bulle: "achevement",
  carillon: "notifications",
  deverrouillage: "ambiance",
  verrouillage: "ambiance",
  ouverture: "ambiance",
};

export interface SoundPrefs {
  enabled: boolean;
  /** 0 à 100. */
  volume: number;
  categories: Record<SoundCategory, boolean>;
}

/** Sons d'ambiance doux activés par défaut (décision du 27/09/2026). */
export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  enabled: true,
  volume: 60,
  categories: { interface: true, achevement: true, notifications: true, ambiance: true },
};

export function isSoundPrefs(value: unknown): value is SoundPrefs {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.enabled === "boolean" && typeof v.volume === "number" && typeof v.categories === "object";
}

/** Faut-il jouer ce son avec ces réglages ? */
export function shouldPlay(prefs: SoundPrefs, name: SoundName): boolean {
  return prefs.enabled && prefs.volume > 0 && prefs.categories[SOUND_CATEGORY[name]] !== false;
}

/** Volume réel (0 à 1), sur une courbe douce : l'oreille perçoit mieux les petits volumes. */
export function gainFor(volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return v * v;
}

/** Couleur sonore d'un thème. */
export interface SoundPalette {
  /** Nom affiché dans les Paramètres (« Gouttes d'eau »). */
  label: string;
  wave: OscillatorType;
  /** Multiplie la durée de résonance des notes. */
  release: number;
  /** Ajoute un harmonique aigu cristallin (clochettes). */
  shimmer: number;
  /** Glissement de hauteur au début de chaque note : au-dessus de 1, la note monte (goutte d'eau) ;
   *  en dessous, elle descend. */
  glide: number;
  /** Décalage de hauteur, en demi-tons. */
  transpose: number;
  /** Écho doux (0 à 1) : la note revient une fois, plus bas en volume. */
  echo: number;
}

const palette = (label: string, p: Partial<Omit<SoundPalette, "label">>): SoundPalette => ({
  label,
  wave: "sine",
  release: 1,
  shimmer: 0,
  glide: 1,
  transpose: 0,
  echo: 0,
  ...p,
});

/** Les sons de chacun des thèmes (cahier des charges § 6 : vagues pour Lagon, clochettes pour Hiver). */
export const PALETTES: Record<string, SoundPalette> = {
  aqua: palette(tr("Gouttes d'eau"), { glide: 1.35 }),
  jade: palette(tr("Feuillage"), { wave: "triangle", release: 0.9, glide: 1.2, transpose: -1 }),
  glycine: palette(tr("Carillon de glycine"), { release: 1.5, shimmer: 0.25, transpose: 3 }),
  ambre: palette(tr("Braise"), { wave: "triangle", release: 1.1, glide: 1.1, transpose: -2 }),
  nuage: palette(tr("Coton de nuage"), { release: 1.6, glide: 1.25, transpose: 4 }),
  minuit: palette(tr("Minuit"), { wave: "triangle", release: 1.7, shimmer: 0.3, echo: 0.3, transpose: -3 }),
  frutiger: palette(tr("Ruisseau"), { glide: 1.4, release: 1.1, shimmer: 0.15, transpose: 2 }),
  prairie: palette(tr("Bois et brise"), { wave: "triangle", release: 0.75, transpose: -2 }),
  lagon: palette(tr("Vagues"), { glide: 1.5, release: 1.3, echo: 0.4 }),
  tropiques: palette(tr("Tambour d'acier"), { wave: "triangle", release: 0.7, shimmer: 0.25, transpose: 2 }),
  "aurore-boreale": palette(tr("Lueurs"), { release: 2, shimmer: 0.3, echo: 0.45, transpose: -3 }),
  printemps: palette(tr("Pépiements"), { release: 0.8, glide: 1.2, transpose: 5, shimmer: 0.15 }),
  ete: palette(tr("Grelots d'été"), { wave: "triangle", release: 0.85, glide: 1.1, transpose: 2 }),
  automne: palette(tr("Feuilles"), { wave: "triangle", release: 1.3, transpose: -4 }),
  hiver: palette(tr("Clochettes"), { release: 1.8, shimmer: 0.55, transpose: 7 }),
  noel: palette(tr("Grelots de Noël"), { wave: "triangle", release: 1.6, shimmer: 0.6, transpose: 5 }),
  "nouvel-an": palette(tr("Étincelles"), { release: 1.2, shimmer: 0.45, echo: 0.35, transpose: 5 }),
  "saint-valentin": palette(tr("Cœurs"), { release: 1.3, glide: 1.15, transpose: 3 }),
  paques: palette(tr("Coquilles"), { wave: "triangle", release: 0.6, transpose: 7 }),
  halloween: palette(tr("Fantômes"), { wave: "triangle", release: 1.5, glide: 0.75, echo: 0.5, transpose: -5 }),
  zen: palette(tr("Bol chantant"), { release: 2.3, shimmer: 0.25, transpose: -5 }),
  energie: palette(tr("Pétillant"), { wave: "triangle", release: 0.55, transpose: 4 }),
  cocon: palette(tr("Coton"), { release: 1.4, transpose: -2 }),
  "bulles-irisees": palette(tr("Bulles"), { glide: 1.5, shimmer: 0.3, echo: 0.3 }),
  "nuit-etoilee": palette(tr("Ciel étoilé"), { wave: "triangle", release: 1.6, shimmer: 0.35 }),
  abysses: palette(tr("Sonar"), { glide: 1.25, release: 1.8, echo: 0.5, transpose: -7 }),
  lavande: palette(tr("Brise de lavande"), { release: 1.5, shimmer: 0.2, transpose: 2 }),
  terracotta: palette(tr("Terre cuite"), { wave: "triangle", release: 0.9, glide: 1.1, transpose: -3 }),
  ardoise: palette(tr("Ardoise"), { wave: "triangle", release: 0.7, transpose: -1 }),
  velours: palette(tr("Velours"), { release: 1.7, echo: 0.3, transpose: -4 }),
  onyx: palette(tr("Verre fumé"), { release: 1.2, shimmer: 0.2, echo: 0.25, transpose: -6 }),
};

export function paletteFor(themeId: string): SoundPalette {
  return PALETTES[themeId] ?? PALETTES.aqua!;
}

interface Note {
  /** Hauteur en hertz. */
  freq: number;
  /** Départ, en secondes après le déclenchement. */
  at: number;
  /** Durée de résonance, en secondes. */
  duration: number;
  gain: number;
}

/** Partition de chaque son (do-mi-sol aigus, pour un caractère clair et doux). */
export const SCORES: Record<SoundName, readonly Note[]> = {
  clic: [{ freq: 1568, at: 0, duration: 0.05, gain: 0.05 }],
  bulle: [
    { freq: 523.25, at: 0, duration: 0.14, gain: 0.16 },
    { freq: 1046.5, at: 0.05, duration: 0.12, gain: 0.07 },
  ],
  carillon: [
    { freq: 1046.5, at: 0, duration: 1.1, gain: 0.08 },
    { freq: 1318.5, at: 0.12, duration: 1.1, gain: 0.07 },
    { freq: 1568, at: 0.24, duration: 1.3, gain: 0.07 },
  ],
  deverrouillage: [
    { freq: 783.99, at: 0, duration: 0.45, gain: 0.08 },
    { freq: 1046.5, at: 0.09, duration: 0.6, gain: 0.08 },
  ],
  verrouillage: [
    { freq: 1046.5, at: 0, duration: 0.35, gain: 0.07 },
    { freq: 783.99, at: 0.09, duration: 0.5, gain: 0.07 },
  ],
  ouverture: [
    { freq: 523.25, at: 0, duration: 0.9, gain: 0.06 },
    { freq: 659.25, at: 0.08, duration: 0.9, gain: 0.06 },
    { freq: 783.99, at: 0.16, duration: 0.9, gain: 0.06 },
    { freq: 1046.5, at: 0.24, duration: 1.2, gain: 0.06 },
  ],
};

/** Moteur audio : créé au premier son (après un geste de la personne), puis réutilisé. */
class SoundEngine {
  private ctx: AudioContext | null = null;

  private context(): AudioContext | null {
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  play(name: SoundName, palette: SoundPalette, volume: number): void {
    const ctx = this.context();
    if (!ctx) return;
    const master = ctx.createGain();
    master.gain.value = gainFor(volume);
    master.connect(ctx.destination);
    const start = ctx.currentTime + 0.01;
    const pitch = 2 ** (palette.transpose / 12);
    // L'écho rejoue la partition un peu plus tard, plus doucement.
    const passes = palette.echo > 0 ? [{ delay: 0, gain: 1 }, { delay: 0.17, gain: palette.echo * 0.6 }] : [{ delay: 0, gain: 1 }];
    for (const pass of passes) {
      for (const base of SCORES[name]) {
        const note = { ...base, freq: base.freq * pitch, at: base.at + pass.delay, gain: base.gain * pass.gain };
        this.note(ctx, master, note, start, palette);
        if (palette.shimmer > 0) {
          this.note(ctx, master, { ...note, freq: note.freq * 2.76, gain: note.gain * palette.shimmer }, start, palette);
        }
      }
    }
  }

  private note(ctx: AudioContext, out: AudioNode, note: Note, start: number, palette: SoundPalette): void {
    const t0 = start + note.at;
    const length = note.duration * palette.release;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = palette.wave;
    osc.frequency.setValueAtTime(note.freq / palette.glide, t0);
    osc.frequency.exponentialRampToValueAtTime(note.freq, t0 + 0.035);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(note.gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.connect(env);
    env.connect(out);
    osc.start(t0);
    osc.stop(t0 + length + 0.05);
  }
}

export const soundEngine = new SoundEngine();
