import { useEffect } from "react";
import { useToast } from "../app/ToastProvider";
import { readPref, writePref } from "../lib/storage";
import { useNavigation } from "../navigation/NavigationProvider";
import { preselectSettingsTab } from "../screens/settingsTab";
import { dayKey } from "../tasks/day";
import { backupsApi } from "./backupsApi";
import { RESTORED_FLAG } from "./RestoreDialog";
import { tr } from "../i18n/i18n";

const isString = (v: unknown): v is string => typeof v === "string";

/**
 * Messages des sauvegardes, une fois le compte ouvert : « Sauvegarde restaurée. » après une
 * restauration, et au plus une fois par jour le rappel de sauvegarde externe (30 jours).
 */
export function BackupNotices() {
  const notify = useToast();
  const { go } = useNavigation();

  useEffect(() => {
    let restored = false;
    try {
      restored = window.sessionStorage.getItem(RESTORED_FLAG) === "1";
      window.sessionStorage.removeItem(RESTORED_FLAG);
    } catch {
      // Stockage indisponible.
    }
    if (restored) {
      notify(tr("Sauvegarde restaurée."));
      return;
    }
    const today = dayKey(new Date());
    if (readPref("rappelSauvegardeExterne", "", isString) === today) return;
    const timer = window.setTimeout(() => {
      void backupsApi
        .status()
        .then((status) => {
          if (!status.externalReminder) return;
          writePref("rappelSauvegardeExterne", today);
          notify(tr("Aucune sauvegarde sur un disque externe depuis 30 jours."), {
            label: tr("Régler"),
            run: () => {
              preselectSettingsTab("sauvegardes");
              go("parametres");
            },
          });
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearTimeout(timer);
    // Une fois par ouverture du compte.
  }, []);

  return null;
}
