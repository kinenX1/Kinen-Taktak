# Learn — SketchUp 2016

Site statique en français pour apprendre SketchUp 2016 (définition, interface, outils, tutoriel, raccourcis, FAQ).
Sponsorisé par MovEra.

Aucune installation : `index.html`, `styles.css` et `app.js` suffisent.

## Voir le site en local

```bash
cd learn
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Mettre en ligne (Vercel)

1. Sur vercel.com : **Add New › Project**, importez ce dépôt.
2. **Root Directory** : `learn`. **Framework Preset** : *Other*. Pas de commande de build.
3. Cliquez **Deploy** : le site est en ligne sur une adresse `*.vercel.app`.
