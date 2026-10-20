# Ce qui a été vérifié — et ce qui ne l'est pas

Dernière vérification : 20 octobre 2026, sur le commit `4af310c` (version 2.2.0).

Deux niveaux de preuve :

1. **tests automatiques** (`npm test`, 58 tests, 10 fichiers) — logique pure, exécutés à chaque
   build par la CI GitHub Actions ;
2. **parcours dans un vrai navigateur** — Chromium piloté par Playwright, en 390 × 844 (téléphone
   tactile), 820 × 1180 (tablette) et 1280 × 800 (ordinateur), sur trois PDF : le rapport texte
   fourni, la facture scannée fournie et un rapport généré de 20 pages.

## Parcours testés dans le navigateur

| # | Parcours | Résultat observé |
| --- | --- | --- |
| 1 | Ouvrir un PDF de 20 pages | 20 pages, zoom automatique à la largeur (63 % sur téléphone, 64 % sur ordinateur) |
| 2 | Toucher une ligne et la réécrire | champ posé à l'emplacement de la ligne, au-dessus du clavier ; validation par la coche ou `Ctrl+Entrée` |
| 3 | Exporter puis rouvrir le PDF | le nouveau texte est présent, l'ancien a disparu (vérifié en relisant le PDF produit) |
| 4 | Annuler / rétablir | 1 modification → 0 → 1, boutons et raccourcis |
| 5 | Rechercher « lumière » | 7 résultats dans le texte natif |
| 6 | Annoter : surlignage, dessin libre, coche, date, tampon | 5 objets posés, exportés en objets PDF réels, retrouvés à la réouverture |
| 7 | Signature tapée | image générée, placée au centre de la vue, poignées de déplacement / taille / rotation / suppression |
| 8 | Tampon « APPROUVÉ » | texte et cadre à la taille réelle du PDF ; l'aperçu à l'écran correspond à l'export |
| 9 | Remplir un formulaire AcroForm | 3 à 4 champs détectés selon le PDF, remplis, exportés |
| 10 | Pages : grille, glisser-déposer | 20 vignettes, ordre du PDF réellement modifié (relu avec pypdf) |
| 11 | OCR d'un scan en un geste | 38 lignes reconnues, éditables au toucher |
| 12 | Compresser (3 niveaux) | estimations affichées, export du niveau choisi |
| 13 | Fichiers | documents conservés dans IndexedDB : 3 entrées, ouvrir / renommer / partager / supprimer |
| 14 | Langues FR / EN / AR | libellés, cartes et feuilles traduits ; arabe en RTL ; aucune erreur console |
| 15 | Thème sombre | automatique (préférence système) et manuel, contrastes lisibles |
| 16 | Aide au premier lancement | 3 écrans, mémorisée après fermeture |
| 17 | Pincer pour zoomer | 100 % → 152 %, rendu net après relâchement |
| 18 | Balayer pour changer de page | page 1 → 2, puis retour ; geste ignoré quand un outil est actif |
| 19 | Mouvement réduit (`prefers-reduced-motion`) | transitions ramenées à ~0 s |
| 20 | Site publié (GitHub Pages) | pages 404/200 OK, 14 cartes d'outils, texte éditable, aucune erreur console |

## Non testé ici — à vérifier sur un vrai appareil

- **Safari sur iPhone et iPad** et **Firefox** : seuls Chromium et son moteur tactile ont servi.
  Le build legacy et les polyfills visent ces navigateurs, mais rien ne le prouve sans essai.
- **Appareil photo** : le bouton ouvre un champ fichier en mode capture ; l'accès réel à la caméra
  n'a pas été exercé.
- **Partage natif** : `navigator.share` n'existe pas dans le navigateur de test ; le repli
  téléchargement a été utilisé.
- **Installation PWA et hors ligne** : le service worker ne s'active qu'en production, jamais dans
  les tests ; l'installation n'a pas été essayée.
- **PDF chiffrés par mot de passe** : aucun fichier de ce type n'était disponible ; seul le
  dialogue de saisie est couvert par le code.
- **PDF très volumineux** (> 60 Mo, jusqu'à la limite de 200 Mo) : non essayé, faute de fichier.
- **Qualité de l'OCR** : mesurée uniquement sur les exemples fournis (fra + eng) ; pas d'essai
  espagnol, allemand ou arabe au-delà du chargement des modèles.
- **Impression et accessibilité lecteur d'écran** : non vérifiées (attributs ARIA en place, mais
  pas de test NVDA / VoiceOver).
