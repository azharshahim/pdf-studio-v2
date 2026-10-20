# PDF Studio — OCR & édition de PDF · V2

Application web **100 % locale** : ouvrez un PDF, cliquez sur un texte pour le corriger, lancez
l'OCR sur les pages scannées (français + anglais) puis exportez un PDF modifié et/ou une couche de
texte recherchable.

Aucun fichier n'est envoyé sur un serveur : le rendu, l'OCR, l'édition et l'export s'exécutent
entièrement dans le navigateur.

---

## Nouveautés de la V2

- **OCR local FR / EN** (Tesseract.js + modèles embarqués)
  - reconnaissance page par page ou sur tout le PDF, barre de progression, annulation ;
  - blocs de texte positionnés sur la page, sélectionnables et **éditables** ;
  - segmentation intelligente des colonnes et tableaux (chaque cellule reste indépendante).
- **Édition du texte**
  - réécriture d'une ligne existante ou ajout d'un bloc libre ;
  - police (Helvetica / Times / Courier), taille, gras, italique, couleur du texte ;
  - **couleur de fond échantillonnée automatiquement** pour masquer proprement l'original ;
  - **couleur du texte détectée** (un titre blanc sur fond sombre reste blanc) ;
  - option « ajuster la taille à la zone ».
- **Recherche** insensible à la casse et aux accents, dans le texte natif **et** le texte OCR.
- **Export**
  - PDF avec les modifications appliquées ;
  - PDF avec couche OCR invisible (texte recherchable / sélectionnable) ;
  - les deux combinés ;
  - texte brut `.txt` de tout le document ;
  - fenêtre d'aperçu avec lien de téléchargement après génération.
- **Confort**
  - extraits d'exemple intégrés : rapport texte et facture scannée ;
  - vignettes de pages (rendu paresseux), zoom, navigation clavier ;
  - interface responsive (panneau latéral escamotable sur mobile).

---

## Démarrage

```bash
npm install --legacy-peer-deps
npm run dev        # http://localhost:5173
```

> `--legacy-peer-deps` contourne un bug de résolution de npm 10 rencontré à l'installation.
> Toutes les dépendances sont déjà présentes dans `node_modules` si le projet vous est livré avec.

Build de production :

```bash
npm run build      # génère dist/
npm run preview    # http://localhost:4173
```

---

## Utilisation

1. **Ouvrir** un PDF avec le bouton, par glisser-déposer, ou tester un exemple depuis l'écran
   d'accueil.
2. **Éditer** : cliquez sur n'importe quelle ligne du document (curseur texte). Le panneau de
   droite permet de changer le contenu, la police, la taille, le style et les couleurs, puis
   **Valider**. « Rétablir l'original » supprime la modification.
3. **OCR** : onglet OCR → choisir la langue → « Cette page » ou « Tout le PDF ». Les blocs
   reconnus apparaissent en pointillés sur la page et deviennent éditables comme le texte natif.
4. **Exporter** : bouton Exporter → cocher « Appliquer les modifications » et/ou « Ajouter la
   couche OCR » → Télécharger le PDF. L'aperçu confirme le résultat.

### Raccourcis

| Raccourci | Action |
| --- | --- |
| `Ctrl/Cmd + O` | Ouvrir un PDF |
| `Ctrl/Cmd + F` | Rechercher |
| `Ctrl/Cmd + S` | Exporter le PDF |
| `←` / `→` | Page précédente / suivante |
| `+` / `−` | Zoom avant / arrière |
| `Échap` | Fermer le panneau, annuler l'ajout de texte |
| `Ctrl/Cmd + Entrée` | Valider l'édition en cours |

---

## Architecture

```
pdf-studio/
├── index.html            # structure de l'interface
├── src/
│   ├── main.js           # application : viewer, édition, OCR, recherche, export, UI
│   ├── pdfEngine.js      # pdf.js : rendu, extraction de lignes + polices
│   ├── ocrEngine.js      # worker Tesseract partagé, parsing des blocs
│   ├── exporter.js       # pdf-lib : masquage, nouveau texte, couche OCR invisible
│   ├── samples.js        # PDF d'exemple (texte et scan) générés à la volée
│   ├── icons.js          # icônes SVG
│   ├── utils.js          # helpers
│   └── style.css         # design system et responsive
└── public/
    ├── pdfjs/            # polices standard, cmaps, wasm de pdf.js
    ├── tesseract/        # worker Tesseract.js
    ├── tesseract-core/   # moteurs wasm (variantes LSTM)
    └── tessdata/         # modèles de langue fra + eng (best_int)
```

### Pipeline d'édition

1. pdf.js extrait les fragments de texte avec leurs coordonnées, tailles et polices réelles
   (`page.commonObjs`).
2. Les fragments sont regroupés en lignes ; chaque ligne devient une zone cliquable.
3. À la sélection, la couleur du fond et la couleur dominante du texte sont échantillonnées sur le
   canvas déjà rendu.
4. À l'export, pdf-lib dessine un rectangle de masquage (couleur du fond) puis le nouveau texte aux
   coordonnées d'origine, avec la police standard la plus proche.
5. La couche OCR est ajoutée en texte invisible (`opacity: 0`) aux positions des mots reconnus,
   en sautant les zones déjà réécrites.

---

## Limites connues

- **Le texte d'origine est masqué visuellement mais reste dans le flux du PDF.** La copie ou
  l'extraction peuvent donc renvoyer l'ancien texte en plus du nouveau. Une suppression réelle des
  opérateurs de texte d'origine demanderait une réécriture complète des flux de contenu (hors
  périmètre de cette version).
- Le rendu est optimal lorsque le fond est uniforme (papier, aplat de couleur). Sur les photos ou
  dégradés, le rectangle de masquage peut être perceptible.
- Les polices d'origine ne sont pas embarquées : l'édition utilise Helvetica, Times ou Courier,
  choisies automatiquement d'après la police détectée.
- Les PDF chiffrés / protégés par mot de passe ne sont pas pris en charge.
- La qualité de l'OCR dépend de la résolution et de la propreté du scan.

---

## Personnaliser les langues OCR

Les modèles se trouvent dans `public/tessdata/` (`fra.traineddata.gz`, `eng.traineddata.gz`).
Pour ajouter une langue :

1. déposer `<lang>.traineddata.gz` dans `public/tessdata/` ;
2. ajouter la langue dans `LANG_MAP` (`src/ocrEngine.js`) et une option dans le sélecteur
   (`index.html`).

Les modèles fournis sont les **best_int** de tessdata (bon compromis taille / précision).

---

## Crédits

- [pdf.js](https://mozilla.github.io/pdf.js/) — Apache-2.0
- [pdf-lib](https://pdf-lib.js.org/) — MIT
- [Tesseract.js](https://tesseract.projectnaptha.com/) — Apache-2.0
- [tessdata](https://github.com/tesseract-ocr/tessdata) — Apache-2.0
- Icônes et illustrations : SVG originaux.

Traitement 100 % local — aucune donnée ne quitte votre navigateur.
