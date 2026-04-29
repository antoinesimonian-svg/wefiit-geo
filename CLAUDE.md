# CLAUDE.md — geo-monitoring

Outil de monitoring GEO (Generative Engine Optimization) : mesure la visibilité de WeFiiT dans les réponses des IA génératives.

---

## Architecture

| Fichier | Rôle |
|---|---|
| `geo-track.mjs` | Script principal — lance les runs, archive les résultats, push GitHub |
| `requetes.json` | Liste des requêtes à monitorer |
| `historique.json` | Archive de tous les runs (source de vérité du dashboard) |
| `dashboard.html` | Dashboard GitHub Pages — visualisation des résultats |
| `geo-check-multi.mjs` | Script secondaire — tests ad hoc multi-runs sur une seule requête |
| `screenshots/` | Captures d'écran par requête / modèle / date |

---

## Commandes

```bash
# Un modèle, une requête
node geo-track.mjs pm-general --model chatgpt
node geo-track.mjs pm-general --model gemini

# Un modèle, toutes les requêtes
node geo-track.mjs --all --model chatgpt
node geo-track.mjs --all --model gemini

# Les deux modèles, toutes les requêtes (run complet)
node geo-track.mjs --all --model all
```

---

## Requêtes monitorées (`requetes.json`)

| ID | Requête | Persona |
|---|---|---|
| `pm-general` | meilleur cabinet conseil product management | PM |
| `pm-paris` | top 5 agences product management Paris | PM |
| `pm-ia` | cabinet spécialisé IA product management | PM / Data-IA |
| `pm-data` | cabinet spécialisé data product management | Data-IA |
| `pmm-general` | cabinet conseil product marketing management | PMM |
| `pm-formation` | je cherche un partenaire pour former mes équipes au product management | Formation |

---

## Structure `historique.json`

```json
{
  "pm-general": {
    "libelle": "meilleur cabinet conseil product management",
    "runs": [
      {
        "date": "2026-04-14",
        "model": "chatgpt",          // "chatgpt" | "gemini"
        "runsOk": 3,                 // runs ayant abouti (sur 3)
        "wefiit": {
          "citations": 2,            // combien de runs ont cité WeFiiT
          "verbatims": ["..."]       // extraits textuels
        },
        "concurrents": {
          "Thiga": 3,                // nb de runs où le concurrent apparaît
        }
      }
    ]
  }
}
```

**Rétrocompatibilité** : les entrées sans champ `model` sont implicitement `"chatgpt"` (`r.model ?? 'chatgpt'`).

---

## Modèles supportés

### ChatGPT
- URL : `https://chatgpt.com/` (mode guest, pas de login)
- Sélecteur input : `#prompt-textarea, [contenteditable="true"][data-placeholder]`
- Détection fin de réponse : `[data-message-author-role="assistant"]` stable 2× de suite

### Gemini
- URL : `https://gemini.google.com/app` (mode guest disponible)
- Attente : `networkidle` + 3s + scroll pour déclencher le rendu Angular
- Sélecteur input : `rich-textarea p` → `rich-textarea [contenteditable]` → `p[data-placeholder]` → `div[contenteditable]`
- Détection fin de réponse : absence du bouton Stop + texte stable 2× de suite
- Nettoyage : suppression du préfixe "Gemini a dit" automatique

---

## Dashboard

**URL** : https://antoinesimonian-svg.github.io/wefiit-geo/dashboard.html

Filtres disponibles : Requête / Modèle (ChatGPT | Gemini) / Période

Mis à jour automatiquement après chaque `geo-track.mjs` via `git push`.

---

## Détection WeFiiT

Patterns regex : `/wefiit/i`, `/we\s*fiit/i`, `/wefiit\.com/i`, `/cabinet\s+wefiit/i`

Verbatims : phrase autour de la mention (entre `.` et `\n`), tronquée à 500 caractères.

---

## Règles importantes

- Ne jamais modifier `historique.json` à la main sauf pour supprimer des entrées vides (`runsOk: 0`) avant un re-run
- Le duplicate-check bloque les runs du même jour **par modèle** — ChatGPT et Gemini peuvent tourner le même jour
- `geo-check-multi.mjs` est un outil de test ad hoc, il ne modifie pas `historique.json`
- Ne pas ajouter de dépendances npm sans validation — seul `playwright` est utilisé

---

## Interface Claude — Commandes conversationnelles

### "état GEO" / "status GEO" / "montre les résultats"

Lire `historique.json` et afficher ce tableau :

```
Requête                                    | Dernier run  | Modèle   | WeFiiT | Top concurrent
"meilleur cabinet conseil PM"              | 2026-04-16   | chatgpt  | 3/3 ✅ | Thiga (3/3)
"top 5 agences PM Paris"                   | 2026-04-16   | chatgpt  | 2/3 ⚠️ | Thiga (3/3)
"cabinet spécialisé IA PM"                 | 2026-04-16   | chatgpt  | 0/3 ❌ | Artefact (3/3)
```

Pour chaque requête sans run : indiquer "Jamais testé".

### "lance les runs" / "run GEO" / "lance le run du jour"

1. Lire `historique.json` pour voir quelles requêtes ont déjà un run aujourd'hui
2. Si toutes ont un run aujourd'hui → informer Antoine
3. Sinon → lancer en background :

```bash
cd "c:/Users/AntoineSIMONIAN/OneDrive - WeFiiT/Documents/projets Claude/wefiit/geo-monitoring" && node geo-track.mjs --all --model chatgpt
```

**Note** : le script push automatiquement vers GitHub après chaque run via git. Pas d'action manuelle nécessaire.

### "lance le run sur [requête]" / "check GEO [thème]"

IDs disponibles : `pm-general`, `pm-paris`, `pm-ia`, `pm-data`, `pmm-general`, `pm-formation`

```bash
cd "c:/Users/AntoineSIMONIAN/OneDrive - WeFiiT/Documents/projets Claude/wefiit/geo-monitoring" && node geo-track.mjs <id> --model chatgpt
```

Pour Gemini : `--model gemini` | Pour les deux : `--model all`

Si Antoine donne un thème libre (ex : "check GEO QA testing") :
1. Proposer 2-3 formulations de requêtes pertinentes
2. Attendre validation
3. Si requête nouvelle → proposer de l'ajouter dans `requetes.json` avant de lancer

### "ajoute la requête [libellé]" / "nouvelle requête"

1. Lire `requetes.json`
2. Générer un `id` en kebab-case depuis le libellé
3. Ajouter l'entrée dans `requetes.json`
4. Ajouter une entrée vide dans `historique.json` : `{ "libelle": "...", "runs": [] }`
5. Confirmer et proposer de lancer le premier run

---

## Format de sortie après un run

```
### Résultats — [date] — [modèle]

| Requête       | WeFiiT | Taux | Top concurrent |
|---------------|--------|------|----------------|
| "..."         | 3/3 ✅ | 100% | Thiga (3/3)    |
| "..."         | 0/3 ❌ | 0%   | Artefact (3/3) |

Score global : X/6 requêtes — Y/18 citations (Z%)
💡 Dashboard : https://antoinesimonian-svg.github.io/wefiit-geo/dashboard.html
```

---

## Concurrents trackés (dans geo-track.mjs)

Thiga, Octo, Xebia, Wivoo, Hubvisory, Mozza, Delva, Swood, TAK, IKXO, Yield Studio, Yeita,
Artefact, Ekimetrics, Converteo, McKinsey, BCG, Bain, Accenture, Capgemini, Wavestone,
Deloitte, EY, PwC, KPMG, Sopra Steria, Atos, Thoughtworks, Publicis Sapient, Cognizant,
Ippon, Zenika, Theodo, Mirakl, Criteo, Alan, Doctolib, Contentsquare, Amplitude, ManoMano

---

## Règles conversationnelles

1. Toujours lire `historique.json` avant de lancer un run (éviter les doublons du jour)
2. Le script tourne en `headless: false` — des fenêtres Chrome vont s'ouvrir, c'est normal
3. Le push GitHub est **automatique** à la fin de chaque run via `geo-track.mjs`
4. Afficher le résumé après chaque run — pas juste "c'est lancé"
5. Ne pas modifier `geo-track.mjs` sauf si Antoine le demande explicitement
6. `geo-check-multi.mjs` = debug uniquement, ne pas l'utiliser pour les runs de suivi
