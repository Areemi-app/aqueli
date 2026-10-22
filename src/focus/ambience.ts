/**
 * Ambiances sonores du Focus (pluie, ruisseau, vagues, café), créées par synthèse comme les
 * autres sons d'Aqueli : des bruits filtrés et lentement modulés, sans aucun fichier.
 */
import { gainFor } from "../sound/sounds";
import type { Ambience } from "./focus";

/** Volume de base : une ambiance reste en fond, sous les sons de l'interface. */
const LEVEL = 0.55;
const FADE_IN = 1.6;
const FADE_OUT = 0.8;
/** Raccord de chaque boucle : la fin se fond dans le début (aucune coupure). */
const SEAM = 1.5;

type NoiseKind = "white" | "pink" | "brown" | "drops";

/**
 * Boucle sans raccord : `raw` compte `seam` échantillons de plus que la boucle ; ils se fondent
 * dans son début (fondu à puissance constante), si bien que la fin enchaîne sur le début.
 */
export function seamlessLoop(raw: Float32Array, length: number, seam: number): Float32Array {
  const data = raw.slice(0, length);
  for (let i = 0; i < seam; i++) {
    const k = i / seam;
    data[i] = raw[i]! * Math.sin((k * Math.PI) / 2) + raw[length + i]! * Math.cos((k * Math.PI) / 2);
  }
  return data;
}

class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private master: GainNode | null = null;
  private stops: (() => void)[] = [];
  private current: Ambience = "aucune";
  private volume = 50;

  private context(): AudioContext | null {
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Bruit de `seconds` secondes qui boucle sans raccord audible. */
  private noise(ctx: AudioContext, kind: NoiseKind, seconds: number): AudioBuffer {
    const key = `${kind}:${seconds}`;
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const seam = Math.floor(rate * SEAM);
    const raw = new Float32Array(length + seam);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === "white") raw[i] = white * 0.5;
      else if (kind === "pink") {
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        raw[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
      } else if (kind === "brown") {
        last = (last + 0.02 * white) / 1.02;
        raw[i] = last * 3.5;
      }
    }
    if (kind === "drops") {
      // Gouttes : de courtes salves amorties, plus ou moins serrées selon le moment.
      const span = Math.floor(rate * 0.012);
      let at = 0;
      while (at < raw.length - span) {
        const strength = 0.12 + Math.random() * Math.random() * 0.88;
        for (let i = 0; i < span; i++) raw[at + i]! += (Math.random() * 2 - 1) * strength * Math.exp(-i / (span / 5));
        const density = 40 + 30 * Math.sin((at / rate) * 0.9) + Math.random() * 30;
        at += Math.floor((rate / density) * (0.3 + Math.random() * 1.4));
      }
    }
    const buffer = ctx.createBuffer(1, length, rate);
    buffer.getChannelData(0).set(seamlessLoop(raw, length, seam));
    this.buffers.set(key, buffer);
    return buffer;
  }

  /** Une couche de bruit filtré, de longueur propre (les couches ne se répètent pas ensemble). */
  private source(ctx: AudioContext, kind: NoiseKind, seconds: number, out: AudioNode, gain: number, filters: BiquadFilterNode[] = []): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, kind, seconds);
    src.loop = true;
    const level = ctx.createGain();
    level.gain.value = gain;
    let node: AudioNode = src;
    for (const f of filters) {
      node.connect(f);
      node = f;
    }
    node.connect(level);
    level.connect(out);
    src.start(ctx.currentTime, Math.random() * seconds);
    this.stops.push(() => src.stop());
    return src;
  }

  private filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  /** Oscillation lente d'un réglage (vagues, remous). */
  private wobble(ctx: AudioContext, param: AudioParam, rate: number, depth: number): void {
    const lfo = ctx.createOscillator();
    const amount = ctx.createGain();
    lfo.frequency.value = rate;
    amount.gain.value = depth;
    lfo.connect(amount);
    amount.connect(param);
    lfo.start();
    this.stops.push(() => lfo.stop());
  }

  /** Gain qui ondule lentement, sans rythme reconnaissable (deux ondulations mêlées). */
  private drift(ctx: AudioContext, out: AudioNode, depth: number): GainNode {
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(out);
    this.wobble(ctx, g.gain, 0.041, depth);
    this.wobble(ctx, g.gain, 0.067, depth * 0.6);
    return g;
  }

  private build(ctx: AudioContext, kind: Ambience, out: GainNode): void {
    switch (kind) {
      case "pluie": {
        const rain = this.drift(ctx, out, 0.12);
        this.source(ctx, "pink", 20, rain, 0.5, [this.filter(ctx, "highpass", 400), this.filter(ctx, "lowpass", 6500)]);
        this.source(ctx, "pink", 17, rain, 0.14, [this.filter(ctx, "highpass", 2500), this.filter(ctx, "lowpass", 9500)]);
        this.source(ctx, "drops", 13, rain, 0.42, [this.filter(ctx, "bandpass", 3200, 0.8)]);
        this.source(ctx, "drops", 11, rain, 0.22, [this.filter(ctx, "bandpass", 1600, 0.7)]);
        break;
      }
      case "ruisseau": {
        const low = this.filter(ctx, "bandpass", 700, 0.9);
        const mid = this.filter(ctx, "bandpass", 1250, 3);
        const high = this.filter(ctx, "bandpass", 2100, 2.5);
        const water = this.drift(ctx, out, 0.08);
        this.source(ctx, "pink", 19, water, 0.85, [low]);
        this.source(ctx, "pink", 23, water, 0.3, [mid]);
        this.source(ctx, "white", 13, water, 0.2, [high]);
        this.wobble(ctx, low.frequency, 0.31, 220);
        this.wobble(ctx, mid.frequency, 0.93, 300);
        this.wobble(ctx, high.frequency, 1.7, 500);
        break;
      }
      case "vagues": {
        const swell = ctx.createGain();
        swell.gain.value = 0.6;
        swell.connect(out);
        this.source(ctx, "brown", 20, swell, 1, [this.filter(ctx, "lowpass", 900)]);
        this.source(ctx, "pink", 17, swell, 0.18, [this.filter(ctx, "bandpass", 1800, 0.6)]);
        this.wobble(ctx, swell.gain, 0.085, 0.4);
        this.wobble(ctx, swell.gain, 0.033, 0.14);
        break;
      }
      case "cafe": {
        const murmur = this.filter(ctx, "bandpass", 420, 0.8);
        const room = this.drift(ctx, out, 0.1);
        this.source(ctx, "brown", 20, room, 0.7, [murmur]);
        this.source(ctx, "pink", 17, room, 0.12, [this.filter(ctx, "bandpass", 1300, 1.2)]);
        this.wobble(ctx, murmur.frequency, 0.23, 120);
        this.clinks(ctx, out);
        break;
      }
      case "aucune":
        break;
    }
  }

  /** Café : de temps en temps, une tasse ou une cuillère, loin. */
  private clinks(ctx: AudioContext, out: AudioNode): void {
    let timer = 0;
    const ring = () => {
      const t0 = ctx.currentTime + 0.02;
      const freq = 2400 + Math.random() * 1800;
      for (const [ratio, gain] of [[1, 0.035], [2.7, 0.012]] as const) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.frequency.value = freq * ratio;
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        osc.connect(env);
        env.connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.4);
      }
      timer = window.setTimeout(ring, 2500 + Math.random() * 6500);
    };
    timer = window.setTimeout(ring, 1500);
    this.stops.push(() => window.clearTimeout(timer));
  }

  /** Joue une ambiance (fondu) ; « aucune » arrête. */
  play(kind: Ambience, volume: number): void {
    this.volume = volume;
    if (kind === this.current && this.master) {
      this.setVolume(volume);
      return;
    }
    this.stop();
    if (kind === "aucune") return;
    const ctx = this.context();
    if (!ctx) return;
    this.current = kind;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.linearRampToValueAtTime(gainFor(volume) * LEVEL, ctx.currentTime + FADE_IN);
    master.connect(ctx.destination);
    this.master = master;
    this.build(ctx, kind, master);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (!this.master || !this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(gainFor(volume) * LEVEL, this.ctx.currentTime, 0.1);
  }

  stop(): void {
    const ctx = this.ctx;
    const master = this.master;
    const stops = this.stops;
    this.master = null;
    this.stops = [];
    this.current = "aucune";
    if (!ctx || !master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + FADE_OUT);
    window.setTimeout(() => {
      for (const stop of stops) {
        try {
          stop();
        } catch {
          // Déjà arrêté.
        }
      }
      master.disconnect();
    }, FADE_OUT * 1000 + 50);
  }

  get playing(): Ambience {
    return this.current;
  }

  get level(): number {
    return this.volume;
  }
}

export const ambience = new AmbienceEngine();
