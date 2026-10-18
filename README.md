# TraceBoard

Tableau d'enquête OSINT dans le navigateur : interface sombre et sobre, canevas infini avec zoom et déplacement, cartes reliables, recherche instantanée (Ctrl/⌘ K), raccourcis clavier, plusieurs enquêtes, sauvegarde locale automatique et import/export JSON. Aucune donnée de démonstration : on démarre sur un tableau vide.

Stack : React 18 + TypeScript + Vite. Aucune dépendance runtime en dehors de React, aucun serveur : les données restent dans votre navigateur (`localStorage`).

## Prérequis

- Node.js 18 ou plus récent (https://nodejs.org)
- npm (installé avec Node.js)

## Installation et lancement

```bash
cd TraceBoard
npm install
npm run dev
```

Ouvrez ensuite l'adresse affichée (par défaut http://localhost:5173).

## Version de production

```bash
npm run build     # vérifie les types puis génère le dossier dist/
npm run preview   # sert dist/ en local
```

Le contenu de `dist/` est statique et peut être hébergé n'importe où.

## Utilisation

| Action | Comment |
|---|---|
| Déplacer le tableau | Glisser le fond (ou un doigt sur mobile) |
| Zoom | Molette / pincement / boutons + et − ; ⌖ ajuste la vue à toutes les cartes |
| Ajouter une carte | Barre d'outils flottante ou touches **1** à **7** (Personne, Pseudo, Photo, URL, Numéro, Document, Note) |
| Rechercher une carte | **Ctrl/⌘ + K** : nom, contenu, notes, sources ; Entrée pour centrer la vue dessus |
| Tout afficher | Bouton d'ajustement ou touche **F** |
| Déplacer une carte | Glisser-déposer |
| Voir / modifier une carte | Cliquer dessus : titre, contenu, notes, sources, image (cartes Photo) |
| Relier deux cartes | Bouton **Relier** ou touche **L**, puis cliquer la carte de départ et celle d'arrivée |
| Personnaliser un lien | Cliquer sur la ligne : étiquette, couleur, style, épaisseur, flèche, inversion |
| Supprimer | Bouton Supprimer, touche Suppr, ou bouton dans le panneau de détails |
| Quitter un mode / désélectionner | Échap |
| Plusieurs enquêtes | Panneau de gauche (☰ sur mobile) : créer, changer, renommer, supprimer |
| Export / import | Boutons « Exporter JSON » (enquête active), « Tout exporter » et « Importer » |

## Sauvegarde

Chaque modification est enregistrée automatiquement dans le navigateur (indicateur « Sauvegardé » en haut). Les images sont réduites (640 px max) pour économiser la place. Les données sont propres à un navigateur et un domaine : utilisez l'export JSON pour sauvegarder ou transférer vos enquêtes. Vider les données du site efface les enquêtes.

## Structure

```
src/
  App.tsx       Interface, état global, enquêtes, import/export
  Board.tsx     Canevas : pan/zoom/pincement, cartes, liens SVG
  Panel.tsx     Panneaux de détails (carte et lien)
  Palette.tsx   Recherche de cartes (Ctrl/⌘ K)
  Icon.tsx      Icônes SVG et logo
  storage.ts    localStorage, validation des imports
  types.ts      Types et constantes
  styles.css    Thème
```

## Usage responsable

TraceBoard est un outil d'organisation. Respectez la loi et la vie privée des personnes lors de vos recherches.
