# Construction 2.3 : ce qui est corrigé et ce qui a été vérifié

Les captures correspondantes sont dans `docs/captures/v2.3/` (et réunies dans
[`planche.png`](captures/v2.3/planche.png)). Elles ont toutes été prises automatiquement à
**390 × 844** (téléphone, émulation tactile) sur la version publiée :
https://azharshahim.github.io/studio-pdf/

## Corrections

| # | Demande | Commit |
| --- | --- | --- |
| 1 | Identifiant PWA `/studio-pdf/` et nom du dépôt partout | `660739e` |
| 2 | Barre d'édition sans chevauchement (coche / titre / Enregistrer + annuler-rétablir) | `cfb21e5` |
| 3 | Zoom d'édition lisible, centré au-dessus du clavier, vue restaurée à la sortie | `be00f36` |
| + | La barre d'onglets s'efface pendant le remplissage d'un formulaire | `6cd4c2d` |
| + | Insertions centrées sur la zone visible, sans se superposer | `63d69fc` |

## Mesures relevées

### Barre d'édition (390 px de large)

| Langue | Titre | Titre / Enregistrer | Titre très long |
| --- | --- | --- | --- |
| Français | « Modifier un PDF » | aucun chevauchement | tronqué par « … » |
| Anglais | « Edit a PDF » | aucun chevauchement | tronqué par « … » |
| Arabe (RTL) | « تعديل ملف PDF » | aucun chevauchement | tronqué par « … » |

Tous les boutons restent dans les 390 px de la barre ; le titre occupe la colonne centrale et
ne passe jamais sous un bouton.

### Zoom d'édition (ligne longue de 800 pt)

| Largeur | Avant | Pendant | Texte à l'écran | Début visible | Au-dessus du clavier | Après validation |
| --- | --- | --- | --- | --- | --- | --- |
| 360 px | 63 % | 148 % | 16,3 px | oui | oui | zoom et défilement identiques (écart 0 px) |
| 390 px | 63 % | 148 % | 16,3 px | oui | oui | idem |
| 430 px | 63 % | 148 % | 16,3 px | oui | oui | idem |

L'annulation (Échap) restaure elle aussi le zoom et le défilement d'origine. Sans zoom appliqué
(texte déjà lisible), la sortie revient à l'ajustement à la largeur.

### PWA

- manifeste servi : `https://azharshahim.github.io/studio-pdf/manifest.webmanifest`
- `id` = `/studio-pdf/`, `start_url` = `./`, `scope` = `./`
- erreurs de manifeste : aucune ; `Page.getInstallabilityErrors` : aucun problème signalé
- service worker actif sur `https://azharshahim.github.io/studio-pdf/sw.js`, cache `studio-pdf-v2.3`
- le mode « application » (sans barre d'adresse) a été lancé et capturé

## Ce qui n'a pas pu être testé ici

- **`chrome://webapks` sur Android Chrome** : cet écran n'existe que sur Android ; aucun appareil
  Android n'est accessible depuis cet environnement. Le manifeste a été validé par les API du
  navigateur (identifiant, portée, erreurs d'installabilité) mais l'entrée réelle dans
  `webapks` reste à confirmer sur téléphone.
- **Installation réelle** (bouton « Installer » ou « Ajouter à l'écran d'accueil ») : le navigateur
  de test n'expose pas l'invite d'installation ; le lancement en mode application a été simulé en
  ligne de commande.
- **Clavier natif** : la hauteur du clavier a été simulée (`visualViewport` + variable `--kb-offset`)
  pour mesurer le cadrage ; le comportement réel d'iOS/Android peut varier de quelques pixels.
- **Safari iOS/iPadOS, Firefox, Edge** : non testés.
- **Compte Google Drive / partage natif / caméra** : non disponibles dans cet environnement.
