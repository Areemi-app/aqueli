/**
 * Fenêtre « Cadrer l'image » : faire glisser l'image pour choisir la partie visible, zoomer
 * (molette, curseur ou touches + et −), la faire pivoter d'un quart de tour, choisir le format.
 * Produit une image JPEG réduite, prête à enregistrer (images des listes, photos des contacts).
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { clampCrop, coverScale, drawTransform, INITIAL_CROP, MAX_ZOOM, outputSize, rotatedSize, zoomAt, type CropState, type Size } from "../lib/crop";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { Segmented } from "./Segmented";
import { tr } from "../i18n/i18n";

export interface CropFormat {
  id: string;
  label: string;
  /** Largeur sur hauteur. */
  ratio: number;
}

export const LIST_FORMATS: readonly CropFormat[] = [
  { id: "paysage", label: tr("Paysage"), ratio: 4 / 3 },
  { id: "carre", label: tr("Carré"), ratio: 1 },
  { id: "portrait", label: tr("Portrait"), ratio: 3 / 4 },
];

const FRAME_MAX = 340;
const ROTATE = "M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7";
const CENTER = "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0";

interface ImageCropperProps {
  /** Fichier choisi, ou image déjà enregistrée (« data: »). */
  source: File | string;
  formats: readonly CropFormat[];
  /** Cadre rond (photo d'un contact). */
  round?: boolean;
  /** Plus grand côté de l'image produite, en pixels. */
  maxSide: number;
  /** Taille maximale du texte « data: » produit ; la qualité baisse au besoin. */
  maxChars: number;
  onDone: (dataUrl: string) => void;
  onCancel: () => void;
}

function frameOf(ratio: number): Size {
  return ratio >= 1 ? { width: FRAME_MAX, height: Math.round(FRAME_MAX / ratio) } : { width: Math.round(FRAME_MAX * ratio), height: FRAME_MAX };
}

export function ImageCropper({ source, formats, round, maxSide, maxChars, onDone, onCancel }: ImageCropperProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState(formats[0]!.id);
  const [crop, setCrop] = useState<CropState>(INITIAL_CROP);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const frame = frameOf(formats.find((f) => f.id === format)?.ratio ?? 1);

  // Adresse de l'image : un fichier est lu sur place, sans copie ailleurs.
  useEffect(() => {
    if (typeof source === "string") {
      setUrl(source);
      return;
    }
    const u = URL.createObjectURL(source);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [source]);

  // Toujours à partir du dernier cadrage : plusieurs mouvements rapides s'additionnent.
  const update = (change: (c: CropState) => CropState) => natural && setCrop((c) => clampCrop(change(c), natural, frame));

  // Changement de format : le cadrage repart du centre.
  useEffect(() => {
    if (natural) setCrop((c) => clampCrop({ ...c, offsetX: 0, offsetY: 0 }, natural, frameOf(formats.find((f) => f.id === format)?.ratio ?? 1)));
  }, [format, natural, formats]);

  // Molette : zoom autour du point visé (écouteur non passif pour garder la page immobile).
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !natural) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setCrop((c) => zoomAt(c, c.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - r.left, y: e.clientY - r.top }, natural, frame));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [natural, frame.width, frame.height]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà relâché : le glisser continue sans capture.
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag.current = { ...d, x: e.clientX, y: e.clientY };
    update((c) => ({ ...c, offsetX: c.offsetX + dx, offsetY: c.offsetY + dy }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key]!;
      update((c) => ({ ...c, offsetX: c.offsetX + dx, offsetY: c.offsetY + dy }));
    } else if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      const k = e.key === "-" ? 1 / 1.15 : 1.15;
      update((c) => ({ ...c, zoom: c.zoom * k }));
    }
  };

  const rotate = () => natural && setCrop((c) => clampCrop({ ...c, rotation: ((c.rotation + 90) % 360) as CropState["rotation"], offsetX: 0, offsetY: 0 }, natural, frame));

  const done = () => {
    const img = imgRef.current;
    if (!img || !natural) return;
    const out = outputSize(frame, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return setError(tr("Image illisible."));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    const t = drawTransform(crop, natural, frame, out);
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle);
    ctx.scale(t.scale, t.scale);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -natural.width / 2, -natural.height / 2);
    for (const quality of [0.86, 0.75, 0.62, 0.5]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= maxChars) return onDone(data);
    }
    setError(tr("Image trop lourde, même réduite."));
  };

  const scale = natural ? coverScale(natural, crop.rotation, frame) * crop.zoom : 1;
  const imgStyle: CSSProperties | undefined = natural
    ? {
        width: natural.width,
        height: natural.height,
        left: (frame.width - natural.width) / 2,
        top: (frame.height - natural.height) / 2,
        transform: `translate(${crop.offsetX}px, ${crop.offsetY}px) rotate(${crop.rotation}deg) scale(${scale})`,
      }
    : undefined;
  const turned = natural ? rotatedSize(natural, crop.rotation) : null;

  // Au premier plan de la page : la fenêtre s'ouvre souvent depuis une autre.
  return createPortal(
    <Dialog title={tr("Cadrer l'image")} onClose={onCancel} className="dialog--cropper">
      <div className="settings-form cropper">
        {formats.length > 1 && <Segmented value={format} options={formats.map((f) => ({ value: f.id, label: f.label }))} label={tr("Format")} onChange={setFormat} />}
        <div
          ref={frameRef}
          className="cropper-frame"
          data-round={round || undefined}
          style={{ width: frame.width, height: frame.height }}
          tabIndex={0}
          role="img"
          aria-label={tr("Image à cadrer. Faire glisser pour déplacer, molette pour zoomer. Au clavier : flèches, touches + et −.")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {url && (
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              className="cropper-image"
              style={imgStyle}
              onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              onError={() => setError(tr("Image illisible."))}
            />
          )}
          <span className="cropper-grid" aria-hidden="true" />
        </div>
        <div className="cropper-tools">
          <label className="cropper-zoom">
            <span className="field-label">{tr("Zoom")}</span>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={crop.zoom} aria-label={tr("Zoom")} onChange={(e) => {
                const zoom = Number(e.target.value);
                update((c) => ({ ...c, zoom }));
              }} />
          </label>
          <button type="button" className="btn-glass btn-glass--sm" onClick={rotate} disabled={!natural}>
            <Icon d={ROTATE} size={14} stroke={2.4} />
            {tr("Pivoter")}
          </button>
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => natural && setCrop(clampCrop({ ...INITIAL_CROP, rotation: crop.rotation }, natural, frame))} disabled={!natural}>
            <Icon d={CENTER} size={14} stroke={2.4} />
            {tr("Recentrer")}
          </button>
        </div>
        {turned && <p className="settings-hint">{tr("Faire glisser l'image pour choisir la partie visible.")}</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onCancel}>
            {tr("Annuler")}
          </button>
          <button type="button" className="btn-gel" onClick={done} disabled={!natural}>
            {tr("Valider")}
          </button>
        </div>
      </div>
    </Dialog>,
    document.body,
  );
}
