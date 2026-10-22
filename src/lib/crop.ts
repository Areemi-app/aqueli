/**
 * Cadrage d'une image (recadrer, zoomer, faire pivoter) : calculs purs du composant
 * `ImageCropper`. L'image couvre toujours tout le cadre ; le décalage est mesuré depuis le
 * centre, en pixels du cadre.
 */

export interface Size {
  width: number;
  height: number;
}

export interface CropState {
  /** 1 : l'image couvre juste le cadre ; jusqu'à `MAX_ZOOM`. */
  zoom: number;
  /** Quart de tour : 0, 90, 180 ou 270 degrés. */
  rotation: 0 | 90 | 180 | 270;
  offsetX: number;
  offsetY: number;
}

export const MAX_ZOOM = 4;
export const INITIAL_CROP: CropState = { zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 };

/** Taille de l'image une fois tournée. */
export function rotatedSize(natural: Size, rotation: CropState["rotation"]): Size {
  return rotation % 180 === 0 ? natural : { width: natural.height, height: natural.width };
}

/** Échelle (pixels du cadre par pixel de l'image) qui couvre juste le cadre, sans zoom. */
export function coverScale(natural: Size, rotation: CropState["rotation"], frame: Size): number {
  const r = rotatedSize(natural, rotation);
  return Math.max(frame.width / r.width, frame.height / r.height);
}

/** Décalage ramené dans les limites : aucun bord de l'image ne rentre dans le cadre. */
export function clampCrop(state: CropState, natural: Size, frame: Size): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, state.zoom));
  const r = rotatedSize(natural, state.rotation);
  const scale = coverScale(natural, state.rotation, frame) * zoom;
  const maxX = Math.max(0, (r.width * scale - frame.width) / 2);
  const maxY = Math.max(0, (r.height * scale - frame.height) / 2);
  return { ...state, zoom, offsetX: Math.min(maxX, Math.max(-maxX, state.offsetX)), offsetY: Math.min(maxY, Math.max(-maxY, state.offsetY)) };
}

/** Zoom autour d'un point du cadre (la molette vise le point sous la souris). */
export function zoomAt(state: CropState, zoom: number, point: { x: number; y: number }, natural: Size, frame: Size): CropState {
  const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const k = next / state.zoom;
  // Le point visé (mesuré depuis le centre du cadre) reste sous la souris.
  const px = point.x - frame.width / 2;
  const py = point.y - frame.height / 2;
  return clampCrop({ ...state, zoom: next, offsetX: px - (px - state.offsetX) * k, offsetY: py - (py - state.offsetY) * k }, natural, frame);
}

/** Taille de l'image produite : proportions du cadre, côté le plus long à `max` pixels au plus. */
export function outputSize(frame: Size, max: number): Size {
  const k = max / Math.max(frame.width, frame.height);
  return { width: Math.max(1, Math.round(frame.width * k)), height: Math.max(1, Math.round(frame.height * k)) };
}

/**
 * Transformation du dessin sur la toile de sortie (de la taille `out`) : origine, angle et
 * échelle à appliquer avant de dessiner l'image centrée sur l'origine.
 */
export function drawTransform(state: CropState, natural: Size, frame: Size, out: Size): { x: number; y: number; angle: number; scale: number } {
  const k = out.width / frame.width;
  return {
    x: out.width / 2 + state.offsetX * k,
    y: out.height / 2 + state.offsetY * k,
    angle: (state.rotation * Math.PI) / 180,
    scale: coverScale(natural, state.rotation, frame) * state.zoom * k,
  };
}
