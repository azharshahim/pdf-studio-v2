# Vérifications V2.4 — édition directe au doigt

Date des mesures : 21 octobre 2026. Application servie en local
(`npm run build && npx vite preview`, puis `npm run dev` pour les parcours de bout en bout).

## 1. Environnement des tests

| Élément | Version |
| --- | --- |
| Chromium (Playwright) | 153.0.8010.12 |
| WebKit (Playwright) | 26.6 — moteur de Safari |
| Firefox (Playwright) | 155.0 — **non exécutable sur cette machine** (voir § 6) |
| Vitest | 4.1.12 — 78 tests, 12 fichiers |
| Playwright Test | 1.63.0 — 9 scénarios × 4 profils |
| Écran | 390 × 844, tactile, facteur d'échelle 1 |
| Profil Samsung | en-tête `SamsungBrowser/26.0` sur moteur Chromium |

Commandes :

```bash
npm test
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

## 2. Curseur au point touché

Ligne d'origine de 88 caractères
(« Le plan stratégique 2026-2028 s'articule autour de trois axes : la création d'un pôle de »),
toucher à une fraction de sa largeur, position du curseur relevée après ouverture.

| Fraction touchée | Index attendu (proportionnel) | Chromium | WebKit |
| --- | --- | --- | --- |
| 5 % | ≈ 4 | **4** | **4** |
| 50 % | ≈ 44 | **43** | **43** |
| 93 % | ≈ 82 | **82** | **82** |

Le test automatique compare au caractère près (tolérance ±1) l'index obtenu à celui calculé par
mesure de police au canevas, pour le début, le milieu et le dernier mot ; il vérifie aussi que le
curseur n'est **ni à 0 ni en fin de ligne**.

Saisie au milieu : toucher à 50 %, taper `ABC` → le texte devient exactement
`préfixe + ABC + suffixe` (vérifié à l'identique dans les quatre profils).

Appui long : après 480 ms sans déplacement, la sélection vaut le mot touché (`collapsed = false`,
aucune espace dans la sélection, mot présent dans la ligne d'origine).

## 3. Lignes plus larges que l'écran

Ligne de 619 px de contenu affichée dans un écran de 390 px, toucher à 95 % de sa largeur.

| Mesure | Chromium | WebKit |
| --- | --- | --- |
| Largeur du bloc éditable | 370 px | 370 px |
| Zone de texte utile | 366 px | 366 px |
| Défilement interne à l'ouverture | 253 px | 254 px |
| Position horizontale du curseur | 351 px (cadre 16 → 380) | 349 px |
| Défilement après saisie de 26 caractères | 414 px | 414 px |
| Position du curseur pendant la saisie | 348 px | 347 px |

Le bloc reste dans l'écran, la ligne défile à l'intérieur et le curseur reste visible avant comme
pendant la saisie. Le recentrage vertical au-dessus du clavier utilise `visualViewport` et n'est
rejoué qu'à l'ouverture, jamais pendant la frappe.

## 4. Retour à la vue après ✓ ou Échap

| Étape | Zoom | Défilement gauche | Défilement haut | Blocs |
| --- | --- | --- | --- | --- |
| Avant (page ajustée) | `null` (ajusté) | 0 | 0 | 0 |
| Pendant l'édition | 1,4815 | 59 | 487 | 1 |
| Après ✓ | `null` | 0 | 0 | 1 |
| Après Échap (frappe conservée) | `null` | 0 | 0 | 1 |
| Après simple toucher puis Échap | `null` | 0 | 0 | **0** |

Le défilement est appliqué trois fois (immédiat, `requestAnimationFrame`, 120 ms) pour absorber la
stabilisation du rendu sur mobile. Un jeton de capture empêche une fermeture différée d'écraser la
vue d'une édition ouverte entre-temps (passage direct d'une ligne à une autre).

## 5. Garde-fous Samsung Internet et repli `textarea`

Profil `SamsungBrowser/26.0` (moteur Chromium) :

| Contrôle | Résultat |
| --- | --- |
| `autocorrect` / `autocapitalize` / `autocomplete` | `off` / `none` / `off` |
| `spellcheck` | `false` |
| `data-samsung` sur le bloc | `true` |
| Frappe sans perte | texte inséré à l'index du curseur |
| Repli après deux sauts de curseur | `contenteditable` → `textarea` |
| Texte conservé au basculement | oui (longueur et contenu identiques) |
| Police du repli | Helvetica, 16,2965 px, interligne 18,9039 px, `rgb(46, 51, 66)` — identique au bloc d'origine |
| Saisie après basculement | caractère inséré, modèle mis à jour |

Composition IME simulée (`compositionstart` → `insertCompositionText` → `compositionend`) : le
nœud texte du `contenteditable` reste **le même objet** (aucun `textContent`/`innerHTML` réécrit),
la surface reste `contenteditable` et le modèle reçoit bien le caractère composé.

## 6. Résultats des suites de bout en bout

| Profil | Résultat local | Remarque |
| --- | --- | --- |
| Chromium 390 × 844 | **9 / 9** (30 s) | exécuté deux fois de suite |
| Samsung (en-tête SamsungBrowser) | **9 / 9** | mêmes scénarios |
| WebKit 390 × 844 | **9 / 9** en passes séparées | dans une passe unique, 1 à 2 tests sont perdus parce que le noyau tue le processus de rendu (`oom-kill`, ≈ 2 Go de mémoire) ; chaque test concerné passe seul, sur le build de production |
| Firefox 390 × 844 | **non exécutable ici** | `oom-kill` du processus « Web Content » dès l'ouverture d'un PDF, quelle que soit la configuration ; exécuté par `.github/workflows/e2e.yml` |

## 7. Ce qui n'a pas pu être testé

- **Un vrai Samsung Internet** sur un appareil : seul l'en-tête `SamsungBrowser` et le moteur
  Chromium ont été reproduits. Les garde-fous (attributs, absence de réécriture, repli) sont
  vérifiés, mais pas le comportement exact du clavier Samsung ni son correcteur.
- **Un clavier natif Android / iOS** : les tests utilisent `touchscreen.tap` et `keyboard.type` ;
  l'apparition du clavier est simulée par `visualViewport` + variable `--kb-offset`, pas par un
  vrai clavier.
- **Une vraie composition IME** (arabe, japonais, dictée) : seuls les événements de composition
  sont émis par script.
- **Firefox sur cette machine** : mémoire insuffisante (voir § 6).
- **Safari iOS réel**, iPad, et le rendu `-webkit-text-size-adjust` sur appareil.
- **L'OCR Tesseract complet** dans la suite de bout en bout : la reconnaissance d'un scan dépasse
  plusieurs minutes sur cette machine ; le parcours teste un bloc OCR injecté (`setOcrLines`) sur
  une page sans couche texte, c'est-à-dire exactement la structure produite par l'OCR.
- **Appui long sur un vrai écran tactile** : le geste est simulé par des événements pointeur avec
  une attente de 650 ms.
