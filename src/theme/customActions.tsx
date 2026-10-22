/**
 * Actions sur les thèmes personnels : exporter en .aqtheme, importer, supprimer (avec
 * « Annuler »), et le pont qui charge leurs fonds d'écran une fois le compte déverrouillé.
 */
import { useEffect } from "react";
import { useToast } from "../app/ToastProvider";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { fromAqtheme, MAX_CUSTOM_THEMES, newCustomId, toAqtheme, type CustomTheme } from "./custom";
import { useTheme } from "./ThemeProvider";
import { hideAllWallpapers, hideWallpaper, showWallpaper, wallpapersApi, wallpaperUrls } from "./wallpapers";
import { tr } from "../i18n/i18n";

export function useCustomThemeActions() {
  const { customThemes, saveCustomTheme, removeCustomTheme, setThemeId, settings } = useTheme();
  const notify = useToast();
  const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));

  const exportTheme = async (c: CustomTheme) => {
    try {
      const data = c.wallpaper ? await wallpapersApi.get(c.id) : null;
      const path = await wallpapersApi.exportTheme(c.name, toAqtheme(c, data));
      if (path) notify(tr("Thème exporté."));
    } catch (err) {
      fail(err);
    }
  };

  const removeTheme = async (c: CustomTheme) => {
    const wasPreferred = settings.fixed === c.id;
    try {
      const data = c.wallpaper ? await wallpapersApi.get(c.id) : null;
      if (c.wallpaper) await wallpapersApi.remove(c.id);
      hideWallpaper(c.id);
      removeCustomTheme(c.id);
      notify(tr("Thème « {name} » supprimé.", { name: c.name }), {
        label: tr("Annuler|action"),
        undo: tr("suppression du thème"),
        run: async () => {
          if (data) {
            await wallpapersApi.set(c.id, data);
            showWallpaper(c.id, data);
          }
          saveCustomTheme(c);
          if (wasPreferred) setThemeId(c.id);
        },
      });
    } catch (err) {
      fail(err);
    }
  };

  /** Lit un fichier .aqtheme choisi par la personne et l'ajoute à ses thèmes. */
  const importFile = async (file: File) => {
    if (customThemes.length >= MAX_CUSTOM_THEMES) {
      notify(tr("{max_custom_themes} thèmes personnels au plus. Supprimez-en un pour en importer un autre.", { max_custom_themes: MAX_CUSTOM_THEMES }));
      return;
    }
    const parsed = fromAqtheme(await file.text(), newCustomId());
    if (!parsed) {
      notify(tr("Fichier de thème illisible."));
      return;
    }
    let name = parsed.theme.name;
    for (let n = 2; customThemes.some((c) => c.name === name); n++) name = `${parsed.theme.name} (${n})`;
    const theme = { ...parsed.theme, name };
    try {
      if (parsed.wallpaper) {
        await wallpapersApi.set(theme.id, parsed.wallpaper);
        showWallpaper(theme.id, parsed.wallpaper);
      }
      saveCustomTheme(theme);
      setThemeId(theme.id);
      notify(tr("Thème « {name} » importé.", { name }));
    } catch (err) {
      fail(err);
    }
  };

  return { exportTheme, removeTheme, importFile, full: customThemes.length >= MAX_CUSTOM_THEMES };
}

/**
 * Fenêtre principale, compte déverrouillé : charge les fonds d'écran des thèmes personnels ; au
 * verrouillage, les libère (l'écran de verrouillage montre le ciel du thème de départ).
 */
export function WallpaperBridge() {
  const { customThemes } = useTheme();
  useEffect(() => () => hideAllWallpapers(), []);
  useEffect(() => {
    let cancelled = false;
    const shown = wallpaperUrls();
    for (const id of shown.keys()) if (!customThemes.some((c) => c.id === id && c.wallpaper)) hideWallpaper(id);
    for (const c of customThemes) {
      if (!c.wallpaper || shown.has(c.id)) continue;
      wallpapersApi
        .get(c.id)
        .then((data) => {
          if (!cancelled && data) showWallpaper(c.id, data);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [customThemes]);
  return null;
}
