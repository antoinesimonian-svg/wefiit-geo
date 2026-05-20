# CLAUDE.md — open-seo

Outil SEO & GEO interne WeFiiT. Hébergé sur Cloudflare Workers.

---

## Qu'est-ce que c'est ?

**open-seo** est une plateforme d'analytics SEO full-stack construite sur Cloudflare Workers + React.
Elle agrège plusieurs outils : rank tracking, audit de site, recherche de mots-clés, backlinks, et un module **GEO Visibility** (suivi de la présence WeFiiT dans les IA génératives).

---

## Stack technique

| Couche | Techno |
|--------|--------|
| Framework client | React 19 + TanStack Start |
| Routing | TanStack Router v1 (file-based) |
| State / Data | TanStack Query (React Query) |
| UI | DaisyUI 5 + Tailwind CSS 4 |
| Graphiques | Recharts |
| Backend | Cloudflare Workers |
| Base de données | Drizzle ORM + D1 (SQLite) |
| Auth | Better Auth 1.5 (hosted) / Cloudflare Access / local_noauth |
| Build | Vite 7 + TypeScript 5.9 |
| Tests | Vitest 3 |
| Lint | Oxlint + Prettier |
| Package manager | pnpm 10 |

---

## Commandes essentielles

```bash
pnpm dev                   # Dev local (AUTH_MODE=local_noauth, port 3001)
pnpm build                 # Build Vite + typecheck
pnpm deploy                # Migration DB prod + build + wrangler deploy
pnpm test                  # Vitest
pnpm lint / lint:fix       # Oxlint
pnpm db:generate           # Générer migration Drizzle
pnpm db:migrate:local      # Appliquer migrations en local
pnpm db:migrate:prod       # Appliquer migrations en prod
```

---

## Structure clé

```
open-seo/
├── public/
│   └── historique.json         ← données GEO (copié depuis geo-monitoring/)
├── src/
│   ├── client/
│   │   └── features/geo/       ← MODULE GEO (voir SPECS.md)
│   │       ├── GeoPage.tsx
│   │       ├── GeoKpiCards.tsx
│   │       ├── GeoEvolutionChart.tsx
│   │       ├── GeoMatriceScores.tsx
│   │       ├── GeoConcurrents.tsx
│   │       ├── GeoVerbatims.tsx
│   │       └── useGeoData.ts
│   ├── routes/
│   │   └── _project/p/$projectId/geo.tsx   ← route /p/:id/geo
│   ├── server/                 ← handlers Cloudflare Workers
│   └── db/                     ← schémas Drizzle
├── docs/
│   ├── SPECS.md                ← specs métier (lire avant toute modif GEO)
│   └── PLAN-geo-integration.md ← plan d'intégration GEO (archivé)
├── drizzle/                    ← migrations (15 à ce jour)
├── wrangler.jsonc              ← config Cloudflare
└── adr/                        ← Architecture Decision Records
```

---

## Module GEO — Règles importantes

Le module GEO est **en lecture seule** côté open-seo : il consomme un fichier JSON statique produit par `geo-monitoring/geo-track.mjs`.

**Flux de données :**
```
geo-monitoring/geo-track.mjs
  → geo-monitoring/historique.json
  → (copie auto) open-seo/public/historique.json
  → fetch("/historique.json") par useGeoData.ts
  → dashboard GEO
```

**Structure historique.json** — deux formats coexistent (rétrocompat) :

| Champ | Entrées ≤ mai 2026-05-10 | Entrées ≥ 2026-05-11 |
|-------|--------------------------|----------------------|
| verbatims | `run.wefiit.verbatims[]` | `run.verbatims[]` (racine) |
| previews | absent | `run.wefiit.previews[]` |

Le hook `useGeoData.ts` gère les deux : `run.verbatims ?? run.wefiit.verbatims ?? []`.

**Ne jamais :**
- Modifier `historique.json` à la main (sauf supprimer des entrées vides `runsOk: 0`)
- Stocker des données GEO en base D1 — le JSON statique suffit
- Ajouter un backend API pour le GEO — ça reste statique

---

## Authentification

Trois modes configurables via `AUTH_MODE` :
- `local_noauth` — dev local, injecte `admin@localhost` (défaut `pnpm dev`)
- `cloudflare_access` — valide les JWTs CF Access (prod self-hosted)
- `hosted` — Better Auth email/password (prod SaaS)

---

## Déploiement

### Infrastructure WeFiiT (mise en place le 2026-05-20)

| Ressource | Valeur |
|---|---|
| **URL prod** | https://open-seo.wefiit-dash.workers.dev |
| **Compte Cloudflare** | antoine.simonian@wefiit.com |
| **Account ID** | 2c7270eaa80f93d3de09fd91284909b0 |
| **Repo GitHub** | github.com/antoinesimonian-svg/dash-acquisition-wefiit |
| **Auth mode** | `local_noauth` (temporaire — passer à `cloudflare_access` avant partage équipe) |

### Ressources Cloudflare

| Service | Nom | ID |
|---|---|---|
| **D1** (base de données) | open-seo | ad0d5887-8d44-4ce5-a941-730cf03b33bf |
| **KV** (cache sessions) | KV | 4539ba20c6634b3aaec0499125b7e995 |
| **KV** (OAuth) | OAUTH_KV | 2ae43daf1b18463c97a85094e8a7154c |
| **R2** (stockage) | open-seo | — |
| **Cron** | rank checks | `*/15 * * * *` |

### Secrets configurés sur le Worker

- `AUTH_MODE` — mode d'authentification (`local_noauth` actuellement)
- `DATAFORSEO_API_KEY` — clé API DataForSEO (base64 login:password)

### CI/CD — GitHub Actions

**Déploiement automatique** : chaque `git push` sur `main` déclenche `.github/workflows/deploy.yml` qui exécute :
1. `pnpm db:migrate:prod` — migrations D1
2. `pnpm build` — build Vite + typecheck
3. `wrangler deploy` — déploiement sur Cloudflare

**Secrets GitHub requis** :
- `CLOUDFLARE_API_TOKEN` — token custom avec D1:Edit, Workers Scripts:Edit, Workers KV:Edit, Workers R2:Edit
- `CLOUDFLARE_ACCOUNT_ID` — `2c7270eaa80f93d3de09fd91284909b0`

### Prochaine étape sécurité

Avant de partager l'URL à l'équipe, configurer **Cloudflare Access** :
1. Dashboard Cloudflare → Zero Trust → Access → Applications
2. Créer une app "Self-hosted" sur `open-seo.wefiit-dash.workers.dev`
3. Policy : autoriser les emails de l'équipe WeFiiT
4. Récupérer le AUD tag
5. Ajouter secrets Worker : `AUTH_MODE=cloudflare_access`, `TEAM_DOMAIN`, `POLICY_AUD`

---

## Conventions de code

- Toujours `===`, jamais `==`
- `await` devant toutes les promesses
- `try/catch` sur tout appel API ou fetch
- Composants en `PascalCase`, hooks en `camelCase` préfixés `use`
- Pas de `console.log` oubliés
- Noms de variables en français pour le domaine métier WeFiiT

---

## Specs métier

→ Voir [docs/SPECS.md](docs/SPECS.md) pour la documentation complète du module GEO.
