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
