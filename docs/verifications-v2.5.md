# Vérifications V2.5 — fichiers, états grisés, outils, diagnostic

Date des mesures : 21 octobre 2026. Application servie en local
(`npm run dev` pour les parcours, `npm run build` + `npx vite preview` après chaque étape).

## 1. Environnement des tests

| Élément | Version |
| --- | --- |
| Chromium (Playwright) | 153.0.8010.12 |
| Profil Samsung Internet | en-tête `SamsungBrowser/26.0`, moteur Chromium |
| WebKit (Playwright) | 26.6 — **non exécutable sur cette machine** (voir § 6) |
| Firefox (Playwright) | 155.0 — **non exécutable sur cette machine** (voir § 6) |
| Vitest | 4.1.12 — **92 tests**, 14 fichiers |
| Playwright Test | 1.63.0 — **19 scénarios** × 4 profils |
| Écran | 390 × 844, tactile, facteur d'échelle 1 |

```bash
npm test          # Vitest — 92 tests
npm run build     # Vite
npm run test:e2e  # Playwright — 19 parcours × 4 profils
```

## 2. Fichiers — le PDF est désormais enregistré avec sa session

Cause du défaut : les octets du PDF n'étaient jamais conservés (seuls les
édits l'étaient) et l'enregistrement automatique **supprimait** l'entrée dès
qu'il n'y avait plus de modification. Toucher un récent affichait donc
« Ouvrez à nouveau le PDF pour reprendre cette session ».

Ce qui est maintenant en place :

- un enregistrement IndexedDB par document : octets du PDF, nom, taille,
  date, modifications, annotations, pages OCR — écrits dans **le même**
  enregistrement, avec fusion à chaque écriture (plus d'écrasement croisé) ;
- limites : **10 documents ou 150 Mo** ; les plus anciens ne sont évincés
  qu'après une confirmation qui nomme les documents concernés ;
- erreur de quota : message explicite (« Le navigateur n'a plus d'espace
  disponible… »), le document reste modifiable et exportable ;
- ouverture directe depuis la liste, avec animation de chargement discrète ;
- bouton **« Parcourir mon appareil »** en tête de liste, taille de chaque
  document et espace total utilisé ;
- icônes partager / renommer / supprimer à **44 × 44 px** ;
- suppression confirmée qui efface **aussi le PDF** ;
- si les octets ont disparu (nettoyage du navigateur) : la ligne affiche
  « Choisir le fichier à nouveau », la session est conservée et reprise dès
  que le bon fichier est choisi (message si ce n'est pas le bon).

Mesures et captures (390 × 844, tactile) :

| Point | Résultat |
| --- | --- |
| Ligne de liste | nom sur deux lignes max, puis `21/10 00:50 · 3,9 Ko` et `1 modif. · 0 OCR` |
| Espace total | `3,9 Ko utilisés sur 150 Mo · 1/10 documents` |
| Cibles tactiles | 44 × 44 px mesurés sur les trois icônes |
| Réouverture après rechargement | modifications retrouvées (texte et compteur), PDF rendu |
| Suppression | dialogue de confirmation, puis 0 enregistrement en base |
| Quota | message explicite, édition toujours possible |
| Octets manquants | « Choisir le fichier à nouveau », session restaurée après le choix du fichier |
| Limite de 10 documents | confirmation nommant `Ancien document 0.pdf`, puis 10 documents restants |

Captures : `docs/captures/v25-fichiers-liste.png`,
`docs/captures/v25-fichiers-suppression.png`, `docs/captures/v25-reouverture.png`.

Tests : `tests/e2e/files.spec.js` (5 scénarios) et `tests/session.test.js`
(9 tests unitaires sur l'éviction, le formatage des tailles et la détection des
erreurs de quota).

## 3. États grisés — aucun défaut reproduit

Cinq cas ont été joués, en thème clair et sombre, en mesurant les styles
**calculés** (opacité, filtre CSS) et l'attribut `disabled` de chaque bouton,
plus le contraste réel du texte modifié :

| Cas | Constat |
| --- | --- |
| Après validation (✓) | lignes, blocs et textes à `opacity: 1`, `filter: none` ; Enregistrer, Annuler, mise en forme actifs |
| Après annulation (Annuler puis Échap) | aucun bloc fantôme, retour à la ligne d'origine, Rétablir devient actif |
| En rouvrant la même ligne | barre de mise en forme visible, 0 bouton désactivé, curseur dans le texte |
| En passant à une autre ligne | les deux modifications coexistent, rien d'atténué |
| Scan OCR (fond gris) | texte `#111827` sur fond copié du scan `#fbfaf5` → contraste **≈ 16,9:1** |

**Aucun élément grisé n'a été trouvé** : aucune correction n'a donc été
nécessaire dans `src/`. Les cinq cas restent couverts par
`tests/e2e/etats.spec.js`, qui échouera si une régression réintroduit une
opacité, un filtre ou un `disabled` injustifié.

Captures : `docs/captures/v25-etats-clair.png`,
`docs/captures/v25-etats-sombre.png`, `docs/captures/v25-etats-ocr.png`.

## 4. Outils — vérifiés dans le PDF exporté

Chaque cas est joué au doigt, fait l'objet d'une capture, puis le PDF exporté
est **rouvert avec pdf.js** (dans le processus de test) pour vérifier que
l'élément est bien dans le fichier :

| Cas | Vérification dans le PDF |
| --- | --- |
| Signature dessinée au doigt, placée, déplacée, redimensionnée | au moins une image embarquée (`paintImageXObject`) |
| Tampon « Approuvé » | texte `APPROUVÉ` extractible |
| Tampon date | texte de la date extractible |
| Surlignage jaune d'une phrase | remplissage `#fde047` présent dans les opérations de dessin |
| Champ de formulaire rempli | valeur `Awa Diop` dans l'AcroForm (champ `nom`) |

Deux corrections ont été nécessaires pour que les tests soient fidèles au
geste réel : le pavé de signature capture le pointeur (il faut donc de vrais
événements, pas des `PointerEvent` synthétiques), et les couleurs de
remplissage sont lues telles que pdf.js les expose (`#fde047`).

Captures : `docs/captures/v2.5/outil-signature-pave.png`,
`outil-signature.png`, `outil-tampon-approuve.png`, `outil-tampon-date.png`,
`outil-surlignage.png`, `outil-formulaire-saisie.png`, `outil-formulaire.png`.

Tests : `tests/e2e/outils.spec.js` (5 scénarios).

## 5. Mode diagnostic

Réglage **désactivé par défaut**, dans l'écran Outils. Une fois activé, un
badge discret s'affiche au-dessus des barres basses :

```
Chrome 153 · contentEditable · offset 15
```

- navigateur détecté à partir de l'en-tête (Samsung Internet reconnu avant
  Chrome, Edge avant Chrome, Safari à partir de `Version/`) ;
- mode d'édition réellement utilisé (`contentEditable` ou `textarea` après le
  repli) ;
- position du curseur, rafraîchie pendant la frappe.

La préférence est mémorisée (`localStorage`, clé `pdf-studio-diagnostic`) et
reste désactivée tant que l'utilisateur ne l'active pas.

Tests : `tests/diagnostic.test.js` (5 tests unitaires) et
`tests/e2e/diagnostic.spec.js` (désactivé par défaut, suit le curseur,
mémorisation). Capture : `docs/captures/v25-diagnostic.png`.

## 6. Navigateurs

| Moteur | Statut |
| --- | --- |
| Chromium 153 (Playwright) | **testé en local** : 19/19 parcours en passes séparées |
| Profil Samsung Internet (Chromium + en-tête `SamsungBrowser/26.0`) | **testé en local** : 19/19 en passes séparées |
| WebKit 26.6 (moteur de Safari) | **non exécutable ici** : bibliothèques système absentes de cette machine (`libgstreamer`, `libgtk-4`, `libflite`…) ; exécuté par la CI |
| Firefox 155 | **non exécutable ici** : le processus de rendu est tué par le noyau (≈ 2 Go de mémoire) dès l'ouverture d'un PDF ; exécuté par la CI |

Sur cette machine de test (2 Go), une passe unique de l'ensemble des parcours
perd parfois un test : le processus de rendu est tué par le noyau, sans
assertion en échec. Chaque test concerné repasse seul. La CI
(`.github/workflows/e2e.yml`) exécute les 19 parcours sur les quatre profils.

### Ce qui n'a **pas** été testé

- un **vrai Samsung Internet** (seuls l'en-tête et le moteur sont simulés) ;
- le **clavier natif** d'Android et d'iOS (le clavier est simulé) ;
- une **vraie composition IME** (les événements sont émis par script) ;
- **Safari sur iPhone / iPad** et Firefox sur un vrai appareil ;
- l'**OCR complet** (Tesseract) dans les tests de bout en bout : la couche de
  texte est injectée pour ne pas attendre plusieurs minutes ;
- l'**appui long physique** sur un écran réel ;
- le **partage natif** (`navigator.share`), absent du navigateur de test ;
- l'**éviction réelle** des octets par le navigateur : elle est simulée en
  supprimant les octets de l'enregistrement ;
- le **quota réel** du disque : l'erreur est simulée par un `put` qui lève
  `QuotaExceededError`.

## 7. Limites connues du stockage local

- 10 documents ou 150 Mo par navigateur ; au-delà, l'éviction demande une
  confirmation.
- Les documents vivent dans IndexedDB : vider les données du site, naviguer en
  privé ou un nettoyage automatique du navigateur les efface. La session est
  alors conservée mais le PDF doit être rechoisi.
- Rien n'est synchronisé : un document enregistré sur un appareil n'existe pas
  sur un autre.


## Correctif stockage (v2.5.1)

- Cause du blocage « Enregistrement du PDF… » et « Chargement… » dans Fichiers : mise à niveau d'IndexedDB (v1 → v2) bloquée par une autre fenêtre ouverte, sans `onblocked` ni délai.
- Corrigé : `onblocked`/`onversionchange`, délais (8 s ouverture, 20 s transaction), erreur `StorageError`, écran Fichiers avec Réessayer / Réinitialiser, enregistrement non bloquant, garde-fou de 120 s sur l'écran de chargement, stockage persistant, limite de 10 documents supprimée.
- Vérifié dans Chromium : base v1 gardée ouverte → l'enregistrement se termine en < 1 s ; Fichiers affiche l'erreur après 8 s puis fonctionne après fermeture de l'autre fenêtre. 99 tests unitaires et 48 tests Chromium/Samsung verts.
- Non testé : appareil Samsung réel, Firefox/WebKit (profils indisponibles ici).

## Polices (v2.6, en cours)

- 12 familles libres (SIL OFL) intégrées, avec gras / italique : Arimo, Roboto, Open Sans, Lato, Montserrat, Tinos, Merriweather, Playfair Display, Cousine, Roboto Mono, Courier Prime, Dancing Script (1,1 Mo, hors ligne).
- Aperçu à l'écran et PDF exporté utilisent la même police ; repli sur Noto Sans pour un caractère absent (arabe, etc.).
- Un PDF texte dont la police est dans le catalogue (ex. Roboto) est reconnu et réédité avec cette police.
- Non fait : choix automatique de la police d'un **scan** (le texte n'est qu'une image) ; la police par défaut d'une ligne OCR reste Helvetica, à changer dans la liste.

## Barre d'outils du document (v2.6, étape 1)

- Dans le document, la barre du bas (Accueil/Fichiers/Outils) est remplacée par une barre d'outils : Modifier, Texte, Surligner, Tracer, Signer, Tampon, Commenter, Formulaire (si le PDF en a), Pages, OCR, Plus (→ écran Outils).
- Pendant la modification d'un texte : version compacte (icônes seules) au-dessus de la barre de mise en forme ; un appui sur Signer, Tampon, etc. valide le texte puis ouvre l'outil, en un seul appui.
- Le bouton flottant « + Texte » disparaît du document (doublon).
- Vérifié : 103 tests unitaires et 58 tests Chromium/Samsung (profil 390 px : Signer et Tampon visibles sans défiler).
- Non fait (étapes suivantes) : menu du document façon Adobe (⋮ : Exporter, Compresser, Mot de passe, Imprimer), signatures enregistrées en un geste, reconnaissance automatique de la police d'un scan.

## Menu ⋮ du document (v2.6, étape 2)

- Bouton ⋮ dans la barre du haut : Enregistrer, Exporter…, Partager, Imprimer, Compresser, Convertir, Définir le mot de passe, Rechercher.
- Partager et Imprimer génèrent le PDF avec les modifications, l'OCR et les annotations. Partage vérifié (fichier PDF « -modifie.pdf » transmis à l'API de partage). Impression : via un cadre caché, avec repli (PDF ouvert dans un nouvel onglet) ; **non testée sur un vrai téléphone**.
- Boutons de la barre compacte agrandis (≥ 48 px).
- 105 tests unitaires, 60 tests Chromium/Samsung.

## Correctif WebKit — barre d'outils (v2.6)

- Les tests de GitHub (Chromium, Firefox, WebKit, Samsung) échouaient uniquement sur WebKit : un appui sur Signer / Tampon n'ouvrait rien, car WebKit n'envoie pas toujours de `click` après un `preventDefault` sur `pointerdown`.
- Corrigé : l'action part au relâchement du doigt (déplacement > 10 px = défilement, ignoré) ; le `click` reste pour le clavier.
- Vérifié localement : WebKit 30/30, Chromium + Samsung 60/60, unitaires 105/105. Firefox : vérifié par GitHub uniquement.

## Signatures et tampons enregistrés (v2.6, étape 3)

- Fenêtre « Remplir et signer » : « Mes signatures » en premier (un appui = pose), puis « Remplir rapidement » : Date du jour, ✓, ✗, Mon nom (demandé une fois, gardé sur l'appareil).
- Tampons : les tampons personnalisés peuvent être enregistrés (case cochée par défaut) et reviennent dans « Mes tampons », avec suppression.
- Corrigé au passage : le `click` qui suit un appui sur la barre d'outils retombait sur le fond de la feuille et la refermait ; ce seul clic est maintenant ignoré.
- Vérifié : 105 tests unitaires ; 68 tests Chromium + Samsung ; 34 tests WebKit.

## Retour, Enregistrer sans téléchargement, Partager, signature redimensionnable
- Enregistrer stocke dans Fichiers sans télécharger ; Télécharger est dans le menu ⋮ (9 entrées) ; Partager remplace Exporter sur téléphone ; Retour dans la barre et l'atelier.
- Une signature/tampon/date agrandi(e) s'étire avec son contenu, proportions gardées.
- Sur 390 px, langue/thème/Ouvrir sont masqués dans un document pour que Retour, Partager et ⋮ restent visibles.
- Vérifié : Chromium, Samsung, WebKit (dock + rapide), 105 tests unitaires.

## Sauvegarde, restauration, nettoyage (écran Fichiers)
- « Tout sauvegarder » : un fichier .pdfstudio (PDF + modifications + annotations), partagé ou téléchargé.
- « Restaurer » : relit un .pdfstudio ; un document déjà présent et plus récent est conservé ; fichier invalide refusé.
- « Nettoyer (n) » : retire, après confirmation, les anciens documents sans PDF.
- Vérifié : 114 tests unitaires, files.spec (Chromium et WebKit).

## Scans avec couche de texte cachée
- Un scan avec texte invisible (mode 3, souvent Courier) n'impose plus sa police : l'édition propose Helvetica (sans empattement), modifiable dans la liste de polices.
- Vérifié : test e2e (échoue sans la correction), 117 tests unitaires, Chromium et WebKit.

## Cachets, photos en PDF, audit de conception
- Cachets : créer (3 lignes, 4 formes, couleur) ou importer (fond blanc → transparent), rangés dans « Mes tampons ».
- Photos en PDF : galerie (plusieurs) ou appareil photo, ordre, rotation, A4/Lettre/taille de la photo, couleur/document/N&B.
- Texte caché sous l'image d'un scan (ou en mode invisible) : police sans empattement à l'édition.
- Audit : nom du document dans la barre du haut ; Partager, ⋮ et « + Texte » masqués hors document ; « 1 document » ; dates dans la langue de l'interface ; description de Enregistrer ; messages au-dessus de la barre ; page PDF toujours de gauche à droite en arabe (lettres latines déformées auparavant) ; flèche Retour inversée en arabe.
- Vérifié : 128 tests unitaires, e2e complets Chromium + Samsung (92) et WebKit (46).

## Lecture seule, icône PDF, écran d'accueil, polices

- Les PDF s'ouvrent en lecture seule ; bouton « Modifier » (#readEdit) pour passer en édition (tests/e2e/lecture.spec.js).
- Gestionnaire de fichiers PDF (manifest file_handlers + icônes, launchQueue) ; l'application démarre sur la liste des fichiers, les plus récents en haut.
- Scans : le style (graisse, police) est déduit de l'image pour que les modifications gardent l'aspect d'origine (src/scanStyle.js).
- Catalogue de 110 polices supplémentaires (OFL, chargées à la demande, non précachées) + sélecteur avec aperçu et recherche (tests/e2e/polices.spec.js).
- Suites : vitest 133 OK ; Playwright Chromium + Samsung 100 OK.

## Refonte lecture / modification (v2.6)

- Annotations : un geste interrompu par le navigateur (défilement) ne laisse plus de tracé « fantôme » ; `touch-action: none` pendant un outil, fin de geste sur `pointercancel`, un seul doigt suivi (tests/e2e/annoter.spec.js, gestes tactiles CDP).
- Lecture seule : ouverture à 125 % de la largeur, barre « Remplir et signer / Rechercher / Modifier », sans OCR.
- Remplir et signer : Texte, Signer, Tampon, Date, Coche, Formulaire, Renommer, Terminer. Le fichier se renomme aussi depuis le titre et le menu ⋮.
- Modification : plus de zoom automatique en touchant un texte ; Rechercher/Remplacer (style de la ligne conservé) ; bouton Filigrane (détection, renommer, supprimer) ; OCR, Pages, Plus dans la barre.
- Filigranes : détection des textes inclinés ou très pâles (opérateurs pdf.js), suppression dans les flux de page et les objets de formulaire (tests/watermark.test.js + e2e).
- Suites : vitest 138 OK ; Playwright Chromium + Samsung OK.

## Lecture à la Acrobat (v2.7)

- Surligner, Commenter et Tracer disponibles en lecture seule (barre : Remplir et signer, Surligner, Commenter, Tracer, Rechercher, Modifier).
- Ordinateur : la barre devient une palette verticale flottante à gauche de la page (comme Acrobat) ; en lecture, plus de bouton « + Texte » ni d'astuce de modification.
- Suites : vitest 138 OK ; Playwright Chromium + Samsung 122 OK.

## Palette d'outils sans recouvrement (v2.8)

- Ordinateur : la palette est placée dans une colonne réservée à gauche de la page (la page est décalée, jamais recouverte), compacte et défilante si l'écran est bas.
- Modification : bouton « Photos » (PDF depuis la galerie ou l'appareil photo) ajouté à la barre.

## Onglets et combinaison (v2.9)

- Plusieurs PDF ouverts d'un coup (sélection multiple, glisser-déposer, ouverture Windows) : un onglet par fichier, changement et fermeture d'onglet, session de chaque document conservée.
- Combiner des fichiers (Outils, menu ⋮ ou bouton « Combiner » des onglets) : ajout depuis l'appareil ou depuis les fichiers déjà ouverts, ordre modifiable, nom « Classeur N.pdf » proposé ; après combinaison, la grille des pages s'ouvre pour ranger les pages (tests/combine.test.js, tests/e2e/onglets.spec.js).
- Suites : vitest 140 OK ; Playwright Chromium + Samsung OK (dock mis à jour : 12 lignes dans ⋮).

## Édition fidèle, OCR automatique, correctifs d'audit (v2.10)

- **OCR automatique** : « Modifier » rend tout le fichier modifiable ; les pages sans texte sont reconnues d'elles-mêmes (pastille de progression), plus besoin de passer par l'onglet OCR.
- **Cause des lignes géantes / écriture changée sur scan** : `enhanceContrast` étirait l'histogramme sur 98 % de pixels blancs → page entièrement noire → OCR illisible. Corrigé (seuil bas 0,2 %, aucune retouche sans contraste mesurable) + test.
- **Export des polices du catalogue** : les `.woff2` ne peuvent pas être sous-ensemblés par pdf-lib (table `loca` vide) → texte invisible. Versions `.ttf` générées (`public/fonts/{catalog,more}/*.ttf`, non précachées) et utilisées à l'export. Test de rendu Poppler.
- **Scans à couche cachée** : le rectangle de masquage est toujours dessiné (`hiddenLayer`).
- **Annotations exportées** : rotation horaire autour du centre pour tous les types, notes = vraies annotations PDF `/Text`, textes non WinAnsi remplacés par « ? » au lieu de faire échouer l'export.
- **Gestes** : `pointercancel` annule tracés/formes et restaure les poignées ; gomme active sur les tracés libres.
- **Formulaires** : listes déroulantes/radios, « Valider » recharge le moteur et enregistre, export prend les valeurs du panneau.
- **Autres** : nom du fichier téléchargé = nom renommé, surlignage de recherche visible en lecture, police du catalogue visible pendant la saisie, souligné/alignement/interligne conservés après validation, « Tout remplacer » sans accent sur toute la ligne, alerte à l'ouverture d'un PDF protégé.
- Non traité (à planifier) : défilement continu, sélection de texte en lecture, historique annuler unifié, doublons dans « Fichiers » après opérations de pages, direction des flèches, espaces multiples monospace.

### v2.11 — bulletin « image seule » (comparaison Acrobat)
- OCR à ~3400 px (au lieu de ~2200) : virgules, accents et chiffres mieux lus.
- Séparation des fragments plus fine (écart > 0,85 × hauteur), comme les boîtes pointillées d'Acrobat.
- Graisse par mot comparée aux autres mots de la même ligne (« N° SS » gras, numéro normal).
- Vérifié sur le bulletin fourni : vitest 145, Playwright chromium + samsung 126 OK.

### v2.12 — mode Modifier façon Acrobat (PC)
- Panneau « Modifier » à droite (≥ 901 px) : police, taille, couleur, alignement, G/I/S, interligne, espacement des caractères (Tc), échelle horizontale (Tz), dupliquer/supprimer, ajouter du texte.
- Cadres pointillés permanents autour des blocs, tracés à l'extérieur du texte.
- Tests : vitest 149, Playwright chromium 63, bureau (1280×800) OK.

### v2.13 — déplacer et redimensionner un bloc (comme Acrobat)
- Bloc sélectionné : cadre bleu, poignées rondes aux 4 coins (redimensionner, le texte passe à la ligne), bords du cadre pour le déplacer.
- L'emplacement d'origine reste effacé (écran et export) ; export avec retour à la ligne dans la largeur du cadre.
- Tests : vitest 150, Playwright chromium 64 (dont déplacement/redimensionnement sur grand écran).

### v2.14 — fiabilité avant hébergement
- Compresser / Protéger (filigrane) / Convertir en images partent du document modifié (texte, annotations).
- Les anciennes lectures OCR (version < 3) sont refaites à l'ouverture, sauf si des modifications s'appuient dessus.
- Annuler / Rétablir : un seul historique, dans l'ordre réel (texte et annotations).
- Tests : vitest 150, Playwright chromium 66.

### v2.15 — lecture OCR, lecture seule, petits défauts
- OCR : seconde lecture bloc par bloc (ligne unique, échelle idéale, chiffres seuls avec vote sur 3 tailles, virgule décimale cohérente) : sur le bulletin de test, plus aucun montant sans virgule ni point décimal parasite (≈ 25 s la page).
- Lecture seule : texte sélectionnable / copiable ; défiler au-delà du bas (ou du haut) de la page passe à la page suivante (précédente).
- Pages : plus de doublon dans « Fichiers » après une opération sur les pages ; polices à chasse fixe : espaces d'alignement conservés.
- Tests : vitest 151, Playwright chromium 68.

### v2.16 — nettoyage de feuille scannée et atténuation de filigrane d'image
- **Filigrane sur un scan (`src/scanClean.js`, `openWatermarkSheet`)** : la détection des filigranes texte / objets / annotations PDF (`src/watermark.js`) est conservée ; lorsqu'une page est une image scannée (ou déjà OCRisée), l'outil propose « Enlever le filigrane de l'image » avec estimation de l'arrière-plan papier + garde-fou morphologique sur les traits fins, curseur d'intensité, aperçu avant/après (« Comparer ») et avertissement explicite indiquant que le filigrane vient de l'image et peut être atténué mais pas supprimé parfaitement. Fonctionne aussi après l'OCR et ré-échantillonne le fond des blocs déjà modifiés sans casser l'édition.
- **Outil « Nettoyer la feuille » (façon CamScanner)** : accessible depuis la barre du document (affiché uniquement sur les scans / pages OCRisées et positionné pour tenir dans 390 px de large avec les 6 outils principaux sans défilement horizontal gênant), l'écran Outils, l'onglet OCR, le panneau Modifier (PC) et le toast de fin d'OCR. Huit modes 100 % navigateur (Canvas, sans bibliothèque externe ni requête réseau) : `Original`, `Éclaircir`, `Améliorer`, `Magique` (égalisation d'éclairement par division sur fond morphologique lissé + réajustement de contraste), `Sans filigrane`, `Pas d'ombre`, `Noir et blanc` (seuil adaptatif de Sauvola sur image intégrale), `Niveaux de gris`.
- **Qualité / taille réglable** : sélecteur `Économique` (1400 px, JPEG 0,72 ; JPEG 0,78 en N&B), `Standard` par défaut (2200 px, **JPEG 0,88** ; PNG sans perte en N&B) et `Haute` (2800 px, JPEG 0,95 ; PNG sans perte en N&B).
- **Intégration complète** : application à la page courante ou à toutes les pages avec barre de progression, bouton « Revenir à l'original », remplacement de l'image rastérisée dans le PDF exporté (`exportPdf`, `buildCurrentPdf`, `currentDocumentSource`) tout en gardant la couche de texte OCR invisible exactement aux mêmes coordonnées (texte cherchable et modifiable), historique unifié Annuler / Rétablir (`clean`), sauvegarde de session IndexedDB et archives `.pdfstudio`.
- **Captures** : `docs/captures/v216-facture-avant-apres.png`, `docs/captures/v216-facture-nettoyer-comparer.png`, `docs/captures/v216-filigrane-image.png`.
- **Tests** : `tests/scanClean.test.js` (15 tests unitaires) et `tests/e2e/nettoyer.spec.js` (6 parcours E2E) — vitest 161 OK, Playwright chromium 74 OK (1 ignoré).

### v2.17 — défilement continu, flèches orientées, reflux de paragraphes, signature PAdES et montants OCR
- **Vrai défilement continu en lecture (`index.html`, `src/main.js`, `src/markup.js`, `src/style.css`)** : en mode Lecture pure (`isContinuousRead()`), toutes les pages du document sont empilées verticalement comme dans Acrobat (`#stage` en page 1 + `#readStack` pour les pages 2..N). Un `IntersectionObserver` (`rootMargin: '120% 0px'`) dessine progressivement uniquement les pages visibles et leurs voisines immédiates, tandis que `pruneFarReadPages` ramène les canevas distants de plus de `±3` pages à `1×1` pour préserver la mémoire sur mobile même avec 100 pages. Le défilement met à jour le numéro de page courant et la vignette active ; cliquer sur une vignette fait défiler jusqu'à la page cible ; le zoom pincement à deux doigts, le zoom PC et la sélection de texte restent actifs sur chaque page. Les modes `Modifier`, `Annoter` et `Remplir et signer` conservent l'affichage page par page, et `bindPageFlip` est court-circuité en lecture continue.
- **Sens et manipulation des flèches (`src/markup.js`, `src/exporter.js`, `src/style.css`)** : les flèches sont désormais enregistrées avec leurs coordonnées d'origine `p1` et de pointe `p2` en points PDF, permettant le tracé dans toutes les directions (haut, bas, gauche, droite, diagonales), le déplacement global de la flèche et le déplacement indépendant de ses deux extrémités (`[data-mk-handle="arrow-start"|"arrow-end"]`). L'export PDF (`arrowGeometry`) reproduit exactement la même orientation et la même pointe, tout en conservant la rétrocompatibilité avec les anciennes flèches enregistrées uniquement par `bbox`.
- **Reflux d'un paragraphe entier (`src/paragraphs.js`, `src/inlineEditor.js`, `src/exporter.js`, `src/textRemoval.js`, `src/main.js`)** : en mode `Modifier`, les lignes consécutives d'un même paragraphe (interligne régulier, même police/style, même marge gauche, hors listes et champs clé-valeur courts) sont regroupées en un seul bloc éditable avec retour automatique à la ligne dans la largeur du cadre, sur les PDF texte comme sur les pages OCRisées. Une bascule « Modifier par paragraphe » / « Par ligne » est proposée dans le panneau `Modifier` sur PC et sous forme de bouton rapide sur mobile (défaut : paragraphe sur PC, ligne sur téléphone). L'export efface toutes les lignes d'origine (`origBboxes`) et reproduit les retours à la ligne affichés à l'écran (`wrappedLines`).
- **Signature numérique certifiée PAdES (`src/pades.js`, `src/signature.js`, `src/main.js`)** : option « Signer avec un certificat » dans « Remplir et signer » (et accessible depuis la feuille « Signer ») permettant d'importer localement un certificat `.p12` / `.pfx` avec son mot de passe via `node-forge` (100 % en mémoire locale, aucun envoi réseau ni persistance du certificat ou du mot de passe, effacement mémoire après signature). La signature `ETSI.CAdES.detached` (avec `ESSCertIDv2`, tri canonique DER `SET OF` X.690 §11.6, `/AcroForm` `/SigFlags 3` et `/ByteRange` exact au seul octet près) est apposée en toute dernière étape après toutes les autres modifications, avec avertissement explicite que toute retouche ultérieure invalidera la signature.
- **Montants et devises OCR (`src/ocrGrouping.js`, `src/pdfEngine.js`, `src/main.js`)** : les nombres avec espaces ou points de milliers, signe négatif et symbole ou code monétaire (`2 147,48 €`, `2147,48€`, `1.250,00 EUR`, `-35,20 €`) restent désormais solidaires dans un même bloc OCR même lorsque la densité d'encre de la devise diffère de celle des chiffres.
- **Stabilité CI WebKit (`.github/workflows/e2e.yml`, `playwright.config.js`, `tests/e2e/ocrauto.spec.js`, `tests/e2e/etats.spec.js`)** : délais adaptés à la lenteur de Tesseract WebAssembly sous WebKit Linux (`test.slow()`, timeout projet WebKit relevé) et arrêt propre de l'auto-OCR en arrière-plan lors d'une injection explicite `setOcrLines`.
- **Captures** : `docs/captures/v217-defilement-continu.png`, `docs/captures/v217-fleches-directions.png`, `docs/captures/v217-paragraphe-reflux.png`, `docs/captures/v217-signature-certificat.png`.
- **Tests** : `tests/paragraphs.test.js`, `tests/pades.test.js`, `tests/ocrAmounts.test.js`, `tests/markup.test.js` et parcours E2E `defilement.spec.js`, `fleches.spec.js`, `paragraphes.spec.js`, `signature-certificat.spec.js` — vitest 174 OK (5 ignorés), Playwright chromium 80 OK (1 ignoré).

### v2.18 — correctifs après relecture de la v2.17
- **Changement de page au défilement hors lecture (`src/main.js`, `src/inlineEditor.js`, `src/markup.js`)** : `bindPageFlip` est restauré dans les trois modes page par page (`Modifier`, `Annoter`, `Remplir et signer` : continuer à défiler en bas de page passe à la suivante, et en haut revient à la précédente), tout en restant désactivé en mode `Lecture` où le défilement continu le remplace. Toute interaction de glisser de bloc (`.inline-edge`), de poignée (`.inline-corner`, `[data-mk-handle]`), de signature / tampon (`.mk`), de flèche (tracé, déplacement ou poignées d'extrémités) ainsi que le zoom à deux doigts (`pinch`) bloque immédiatement `bindPageFlip`.
- **Vraies dimensions de toutes les pages en défilement continu (`src/main.js`)** : `ensureContinuousPageSizes` lit dès le chargement la taille exacte (`page.getViewport({ scale: 1 })` de `pdf.js`, sans rendu de pixels) de chaque page `1..N`, supprimant toute estimation à partir de la première page pour qu'un document mélangeant pages portrait et paysage ne saute pas d'un seul pixel pendant le défilement.
- **Alignement des paragraphes reflués (`src/paragraphs.js`, `src/pdfEngine.js`, `src/inlineEditor.js`, `src/exporter.js`, `index.html`, `src/main.js`)** : détection et conservation de l'alignement d'origine du paragraphe (`left`, `center`, `right`, `justify`) à l'ouverture, à l'écran et à l'export PDF (justification exacte mot par mot de `bbox.x` à `bbox.x + bbox.w` sur toutes les lignes non finales du paragraphe), avec bouton « Justifier » ajouté aux contrôles d'alignement du panneau `Modifier` et de la barre de formatage.
- **Arbre git propre après les tests (`tests/e2e/outils.spec.js`)** : les captures générées automatiquement par les tests E2E sont désormais écrites dans `test-results/captures/v2.5/` (ignoré par `.gitignore`) au lieu d'écraser `docs/captures/v2.5/`.
- **Tests** : `tests/paragraphs.test.js`, `tests/e2e/pageflip.spec.js`, `tests/e2e/defilement.spec.js`, `tests/e2e/paragraphes.spec.js` — vitest 176 OK (5 ignorés), Playwright chromium 84 OK (1 ignoré).

### v2.19 — finitions des paragraphes
- **Césure (`src/hyphenate.js`, `src/main.js`, `src/paragraphs.js`)** : coupure syllabique française sans dictionnaire (consonne entre voyelles, groupes inséparables bl/br/ch/cr/gn/ph/pl/tr…, jamais de syllabe muette finale isolée, au moins 3 lettres de chaque côté). Elle s'applique à tous les mots longs d'un paragraphe justifié, et, quel que soit l'alignement, aux mots trop longs pour tenir sur une ligne. Les points de coupure sont des traits d'union conditionnels (U+00AD) : le tiret n'apparaît qu'en fin de ligne, à l'écran comme à l'export (lignes mesurées `wrappedLines`), et n'est jamais enregistré dans le texte.
- **Retrait de première ligne** : un alinéa d'origine (première ligne décalée jusqu'à 4 cadratins) est détecté, conservé dans le bloc (`indent`), affiché dans l'éditeur et l'aperçu, et reproduit à l'export (paragraphes alignés à gauche ou justifiés).
- **Paragraphes justifiés de 2 lignes** : reconnus quand la première ligne s'arrête exactement sur la marge droite commune à d'autres lignes de la même colonne, que la seconde est nettement plus courte et que la première est étirée. Sans marge de référence sur la page, le paragraphe reste aligné à gauche par prudence.
- **Tests** : `tests/hyphenate.test.js`, `tests/paragraphs.test.js` (2 lignes justifiées, alinéa à l'export), `tests/e2e/paragraphes.spec.js` (alinéa + césure : écran, lignes mesurées et export identiques).

### v2.20 — chaque mot garde son style d'origine
- **Styles par caractère (`src/styleRuns.js`)** : un bloc modifié garde des segments `runs` (gras, italique, couleur) dont la concaténation est le texte. À la saisie, les caractères conservés gardent leur style ; le texte inséré prend le style du caractère précédent (ou du mot suivant quand on tape au début d'un mot). Un bloc redevenu uniforme reprend un style unique.
- **Style d'origine à l'ouverture (`src/main.js`)** : couleur relevée mot par mot sur la page (nuances proches regroupées, pour ne pas créer de fausses couleurs dues au scan), gras mot par mot pour les scans OCR (`words` conservés dans les lignes OCR), style majoritaire du bloc pris comme style de base. Un premier mot gras ne met plus toute la ligne ou tout le paragraphe en gras.
- **Écran, éditeur, reflux et export** : un `<span>` par segment à l'écran et dans l'éditeur, mesure du reflux avec les vraies largeurs (mots gras plus larges), et export PDF avec la police (normale, grasse, italique) et la couleur de chaque segment, justification et césure comprises.
- **Mise en forme d'une sélection** : avec du texte sélectionné dans le bloc, Gras, Italique et Couleur ne s'appliquent qu'à la sélection ; sans sélection, à tout le bloc.
- **Tests** : `tests/styleRuns2.test.js`, `tests/e2e/styles.spec.js` (couleur conservée sur un PDF texte, premier mot gras sur un scan OCR, gras sur une sélection).
