# Installateur d'Aqueli (NSIS)

- `crochets.nsh` : textes d'accueil et de fin, couleurs (fond `F3F9FF`, texte `10243A`), choix de la langue au lancement, nettoyage à la désinstallation.
- `langues/<Langue>.nsh` : les textes de l'installateur dans les 17 langues d'Aqueli (UTF-8). Chaque fichier porte les mêmes `LangString` ; une clé ajoutée l'est dans les 17. Déclarés dans `tauri.conf.json` (`bundle.windows.nsis.customLanguageFiles`).
- `cote.svg` → `cote.bmp` (164 × 314) : bandeau des pages d'accueil et de fin. Ciel Aqua, reflets irisés et nacrés, logo sur un disque de verre.
- `entete.svg` → `entete.bmp` (150 × 57) : en-tête des autres pages, qui se fond à gauche dans la couleur de fond.

## Refaire les images

Les BMP sont rendus depuis les SVG : rendu à 4 fois la taille dans un navigateur (police Figtree du projet, logo `assets/logo/aqueli-logo-512.png`), réduction de qualité (Lanczos), puis enregistrement en BMP 24 bits sans transparence, aux dimensions exactes ci-dessus. NSIS refuse d'autres formats.
