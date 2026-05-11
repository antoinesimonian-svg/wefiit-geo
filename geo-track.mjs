/**
 * GEO Track — Lance 3 runs par requête et archive dans historique.json
 *
 * Usage :
 *   node geo-track.mjs --all                        → toutes les requêtes (ChatGPT par défaut)
 *   node geo-track.mjs pm-general                   → une requête spécifique
 *   node geo-track.mjs --all --model gemini         → toutes les requêtes sur Gemini
 *   node geo-track.mjs pm-general --model all       → une requête sur ChatGPT + Gemini
 *   node geo-track.mjs --all --model chatgpt        → explicitement ChatGPT
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const NB_RUNS = 3;
const BASE_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname.replace(/^\//, '').replace(/\/$/, ''));
const REQUETES_PATH = `${BASE_DIR}/requetes.json`;
const HISTORIQUE_PATH = `${BASE_DIR}/historique.json`;
const SCREENSHOTS_BASE = `${BASE_DIR}/screenshots`;
const RESPONSES_BASE = `${BASE_DIR}/responses`;
const GEMINI_SESSION_PATH = `${BASE_DIR}/gemini-session.json`;

const MOTS_CLES_WEFIIT = [/wefiit/i, /we\s*fiit/i, /wefiit\.com/i, /cabinet\s+wefiit/i];

const CONCURRENTS_CONNUS = [
  'Thiga', 'Octo', 'OCTO Technology', 'Xebia', 'Publicis Sapient',
  'Kea & Partners', 'Kea', 'Sia Partners', 'Eleven Strategy',
  'Fabernovel', 'Bain', 'McKinsey', 'BCG', 'Accenture',
  'Capgemini', 'Sopra Steria', 'Wavestone', 'Devoteam',
  'Valtech', 'Artefact', 'Ekimetrics', 'Converteo',
  'fifty-five', 'Data4', 'Keyrus', 'Quantmetry',
  'Theodo', 'Ippon', 'Zenika', 'Onepoint',
  'Wemanity', 'Hubvisory', 'Pentalog', 'Soat',
  'Mind7', 'Ideo', 'Pivotal', 'Thoughtworks',
  'Wivoo', 'Mozza', 'Delva', 'Swood', 'Yield Studio', 'Yield Advisory', 'Yeita', 'IKXO',
  'BAM', 'Niji', 'Stellar', 'TAK', 'Galadrim', 'Polara Studio',
  'Product People', 'Werin Group',
];

// ─────────────────────────────────────────────
// Utilitaires communs
// ─────────────────────────────────────────────

function dateAujourdhui() {
  return new Date().toISOString().split('T')[0];
}

function nettoyerTexte(texte) {
  return texte
    .replace(/^Gemini\s+a\s+dit\s*/i, '')
    // Supprimer les lignes parasites UI (Mapbox, instructions clavier, notes collées)
    .split('\n')
    .map(l => l.trim())
    .filter(l => {
      if (!l) return false;
      if (/mapbox|openstreetmap|deux doigts|two fingers|maintenez ctrl|ctrl pour zoom/i.test(l)) return false;
      // Ligne qui n'est qu'une suite de mots collés avec des chiffres (ex: "Thiga5.0Delva3.8Wivoo")
      if (/^[\w\s]+\d\.\d[\w\s]+\d\.\d/.test(l)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function detecterWefiit(texteRaw) {
  const texte = nettoyerTexte(texteRaw);
  const lignes = texte.split('\n');

  // Trouver toutes les lignes contenant une mention WeFiiT
  const lignesAvecMention = [];
  for (let i = 0; i < lignes.length; i++) {
    if (MOTS_CLES_WEFIIT.some(r => r.test(lignes[i]))) {
      lignesAvecMention.push(i);
    }
  }

  if (lignesAvecMention.length === 0) return { trouve: false, preview: null };

  // Extraire la ligne exacte contenant la première mention WeFiiT (200 chars max)
  let preview = lignes[lignesAvecMention[0]]
    .replace(/(wefiit)([A-ZÀ-Ü])/gi, '$1 $2')
    .trim();
  if (preview.length > 200) preview = preview.substring(0, 200) + '…';

  return { trouve: true, preview };
}

function extraireConcurrents(texte) {
  const trouves = {};
  for (const nom of CONCURRENTS_CONNUS) {
    const regex = new RegExp(nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (regex.test(texte)) {
      trouves[nom] = (trouves[nom] || 0) + 1;
    }
  }
  return trouves;
}

// ─────────────────────────────────────────────
// ChatGPT
// ─────────────────────────────────────────────

async function attendreFinReponse(page, timeout = 90000) {
  const debut = Date.now();
  await page.waitForSelector('[data-message-author-role="assistant"]', { timeout: 30000 }).catch(() => null);

  let textePrec = '';
  let compteurStable = 0;
  while (Date.now() - debut < timeout) {
    await page.waitForTimeout(2000);
    const messages = await page.$$('[data-message-author-role="assistant"]');
    if (messages.length === 0) continue;
    const dernierMessage = messages[messages.length - 1];
    const texteActuel = await dernierMessage.textContent();
    if (texteActuel === textePrec && texteActuel.length > 20) {
      compteurStable++;
      if (compteurStable >= 2) return texteActuel;
    } else {
      compteurStable = 0;
    }
    textePrec = texteActuel;
  }
  return textePrec || '';
}

async function runChatGPT(page, libelle) {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Chercher le premier élément de saisie visible (exclure les fallback cachés)
  const champSaisie = await page.evaluateHandle(() => {
    const candidats = [
      ...document.querySelectorAll('#prompt-textarea, [contenteditable="true"][data-placeholder], div[contenteditable="true"]')
    ];
    return candidats.find(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    }) || null;
  });

  if (!champSaisie || !champSaisie.asElement()) throw new Error('Champ de saisie introuvable');

  await champSaisie.click();
  await page.keyboard.type(libelle, { delay: 30 });
  await page.waitForTimeout(500);

  const boutonEnvoi = await page.$('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Envoyer"]');
  if (boutonEnvoi) await boutonEnvoi.click();
  else await page.keyboard.press('Enter');

  return await attendreFinReponse(page);
}

// ─────────────────────────────────────────────
// Gemini
// ─────────────────────────────────────────────

async function trouverInputGemini(page) {
  // Scroll léger pour déclencher le rendu lazy de Gemini
  await page.evaluate(() => window.scrollTo(0, 100));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  // Cibler le div.ql-editor (Quill) qui est le vrai champ de saisie Gemini
  const selecteurs = [
    'div.ql-editor',
    'rich-textarea div[contenteditable="true"]',
    'rich-textarea [contenteditable]',
    'p[data-placeholder]',
    'div[contenteditable="true"]',
  ];
  for (const sel of selecteurs) {
    const el = await page.waitForSelector(sel, { timeout: 8000, state: 'visible' }).catch(() => null);
    if (el) return el;
  }
  return null;
}

async function attendreFinReponseGemini(page, timeout = 120000) {
  const debut = Date.now();

  // Attendre qu'un conteneur de réponse apparaisse
  const selecteursReponse = ['model-response', 'message-content', '.response-container .markdown'];
  let selecteurUtilise = null;
  for (const sel of selecteursReponse) {
    const trouve = await page.waitForSelector(sel, { timeout: 10000 }).catch(() => null);
    if (trouve) { selecteurUtilise = sel; break; }
  }
  if (!selecteurUtilise) return '';

  let textePrec = '';
  let compteurStable = 0;
  while (Date.now() - debut < timeout) {
    await page.waitForTimeout(2000);

    // Gemini affiche un bouton "Stop" pendant la génération
    const boutonStop = await page.$('button[aria-label*="Stop"], button[aria-label*="Arrêter"], button[aria-label*="stop"]');
    const generationEnCours = !!boutonStop;

    const elements = await page.$$(selecteurUtilise);
    if (elements.length === 0) continue;

    const dernierElement = elements[elements.length - 1];
    const texteActuel = await dernierElement.textContent().catch(() => '');

    if (!generationEnCours && texteActuel === textePrec && texteActuel.length > 20) {
      compteurStable++;
      if (compteurStable >= 2) return texteActuel;
    } else {
      compteurStable = 0;
    }
    textePrec = texteActuel;
  }
  return textePrec || '';
}

async function accepterCookiesGemini(page) {
  // Chercher "Tout accepter" par texte visible dans tous les boutons de la page
  const clique = await page.evaluate(() => {
    const boutons = [...document.querySelectorAll('button')];
    const cible = boutons.find(b =>
      /tout accepter|accept all|j'accepte|agree/i.test(b.textContent?.trim())
    );
    if (cible) { cible.click(); return true; }
    return false;
  });

  if (clique) {
    await page.waitForTimeout(3000);
    return true;
  }

  // Fallback sélecteurs ID stables Google Consent
  const selecteursCookies = ['#L2AGLb', 'form[action*="consent"] button:last-child'];
  for (const sel of selecteursCookies) {
    const bouton = await page.$(sel);
    if (bouton) {
      await bouton.click();
      await page.waitForTimeout(3000);
      return true;
    }
  }

  return false;
}

async function runGemini(page, libelle) {
  await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle', timeout: 40000 }).catch(() => null);
  await page.waitForTimeout(2000);

  // Accepter les cookies si la bannière réapparaît (normalement déjà fait au démarrage)
  await accepterCookiesGemini(page);

  // Détecter un vrai mur de connexion
  const loginWall = await page.$('input[type="email"], form[action*="signin"]');
  if (loginWall) throw new Error('login-wall');

  // Taper directement via le locator Playwright (contourne les checks elementHandle)
  const inputSel = 'div.ql-editor';
  await page.click(inputSel, { force: true });
  await page.waitForTimeout(300);
  await page.type(inputSel, libelle, { delay: 30 });
  await page.waitForTimeout(800);

  // Bouton envoi — forcer aussi avec JS si disabled
  const boutonEnvoiEnvoye = await page.evaluate(() => {
    const btn = document.querySelector(
      'button[aria-label*="Send"], button[aria-label*="Envoyer"], button[mattooltip*="Send"], button[data-test-id*="send"]'
    );
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!boutonEnvoiEnvoye) await page.keyboard.press('Enter');

  return await attendreFinReponseGemini(page);
}

// ─────────────────────────────────────────────
// Orchestration par requête
// ─────────────────────────────────────────────

// context est soit un BrowserContext partagé (Gemini), soit un Browser (ChatGPT — crée un context par requête)
async function lancerRequete(requete, historique, browserOrContext, model = 'chatgpt') {
  const { id, libelle } = requete;
  const dateJour = dateAujourdhui();
  const pauseInterRuns = model === 'gemini' ? 12000 : 8000;

  // Initialiser la section si absente
  if (!historique[id]) {
    historique[id] = { libelle, runs: [] };
  }

  // Vérifier doublon (par date ET par modèle) — ignorer les entrées fantômes (runsOk: 0)
  if (historique[id].runs.find(r => r.date === dateJour && (r.model ?? 'chatgpt') === model && r.runsOk > 0)) {
    console.log(`⚠️  [${id}/${model}] Run déjà effectué aujourd'hui (${dateJour}) — ignoré.`);
    return;
  }

  console.log(`\n=== [${id}/${model}] "${libelle}" ===`);

  // Créer dossier screenshots (inclut le modèle pour éviter les collisions)
  const screenshotDir = `${SCREENSHOTS_BASE}/${id}/${model}`;
  if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

  // Gemini : réutilise le context partagé (cookies déjà acceptés)
  // ChatGPT : crée un context frais par requête
  const context = model === 'gemini'
    ? browserOrContext
    : await browserOrContext.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
      });

  const runs = [];

  for (let run = 1; run <= NB_RUNS; run++) {
    console.log(`  Run ${run}/${NB_RUNS}...`);
    let resultat = { run, statut: 'erreur', wefiitMentionne: false, preview: null, cheminReponse: null, concurrents: {} };

    try {
      const page = await context.newPage();

      let reponse = '';
      if (model === 'gemini') {
        reponse = await runGemini(page, libelle);
      } else {
        reponse = await runChatGPT(page, libelle);
      }

      if (!reponse || reponse.length < 20) {
        resultat.statut = 'timeout';
      } else {
        resultat.statut = 'ok';
        const reponseNettoyee = nettoyerTexte(reponse);
        const detection = detecterWefiit(reponse);
        resultat.wefiitMentionne = detection.trouve;
        resultat.preview = detection.preview;
        resultat.verbatim = reponseNettoyee.slice(0, 500).trim();
        resultat.concurrents = extraireConcurrents(reponse);

        // Sauvegarder la réponse complète dans un fichier texte
        if (!existsSync(RESPONSES_BASE)) mkdirSync(RESPONSES_BASE, { recursive: true });
        const cheminReponse = `${RESPONSES_BASE}/${id}-${dateJour}-${model}-run${run}.txt`;
        writeFileSync(cheminReponse, reponseNettoyee, 'utf-8');
        resultat.cheminReponse = `responses/${id}-${dateJour}-${model}-run${run}.txt`;

        console.log(`  ${detection.trouve ? '✅ WeFiiT présent' : '❌ WeFiiT absent'}`);
      }

      await page.screenshot({ path: `${screenshotDir}/${dateJour}-run${run}.png`, fullPage: true });
      await page.close();
    } catch (err) {
      if (err.message === 'login-wall') {
        console.log(`  ⚠️  Login wall Gemini détecté — run ignoré`);
        resultat.statut = 'login-wall';
      } else {
        console.log(`  ❌ Erreur run ${run} : ${err.message}`);
        resultat.statut = 'erreur';
      }
    }

    runs.push(resultat);
    if (run < NB_RUNS) await new Promise(r => setTimeout(r, pauseInterRuns));
  }

  // Ne pas fermer le context Gemini partagé — il sera fermé dans main()
  if (model !== 'gemini') await context.close();

  // Agréger
  const runsOk = runs.filter(r => r.statut === 'ok');
  const citationsWefiit = runsOk.filter(r => r.wefiitMentionne).length;
  const previews = runsOk.filter(r => r.preview).map(r => r.preview);
  const verbatims = runsOk.map(r => r.verbatim).filter(Boolean);
  const reponsesChemins = runsOk.filter(r => r.cheminReponse).map(r => r.cheminReponse);

  const freqConcurrents = {};
  runsOk.forEach(r => {
    Object.keys(r.concurrents).forEach(nom => {
      freqConcurrents[nom] = (freqConcurrents[nom] || 0) + 1;
    });
  });
  const concurrentsTriees = Object.fromEntries(
    Object.entries(freqConcurrents).sort((a, b) => b[1] - a[1])
  );

  // Rapport terminal
  console.log(`\n  WeFiiT : cité ${citationsWefiit}/${runsOk.length} fois`);
  if (previews.length > 0) {
    previews.forEach((v, i) => console.log(`  Preview ${i + 1} : "${v}"`));
  }
  console.log(`  Concurrents : ${Object.entries(concurrentsTriees).slice(0, 5).map(([n, f]) => `${n} ${f}/${runsOk.length}`).join(', ')}`);

  // Archiver (avec champ model)
  historique[id].runs.push({
    date: dateJour,
    model,
    runsOk: runsOk.length,
    wefiit: { citations: citationsWefiit, previews, reponsesChemins },
    verbatims,
    concurrents: concurrentsTriees,
  });

  console.log(`  ✅ Archivé`);
}

// ─────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const modeAll = args.includes('--all');
  const idCible = !modeAll && args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--model') || null;

  // Parsing --model
  const modelIdx = args.indexOf('--model');
  const modelArg = modelIdx !== -1 ? args[modelIdx + 1] : 'chatgpt';
  if (!['chatgpt', 'gemini', 'all'].includes(modelArg)) {
    console.error('❌ --model doit être : chatgpt | gemini | all');
    process.exit(1);
  }
  const modeles = modelArg === 'all' ? ['chatgpt', 'gemini'] : [modelArg];

  // Charger config requêtes
  if (!existsSync(REQUETES_PATH)) {
    console.error('❌ requetes.json introuvable');
    process.exit(1);
  }
  const requetes = JSON.parse(readFileSync(REQUETES_PATH, 'utf-8'));

  // Déterminer quelles requêtes lancer
  let requetesALancer;
  if (modeAll) {
    requetesALancer = requetes;
    console.log(`=== GEO Track --all [${modeles.join('+')}] : ${requetes.length} requêtes ===`);
  } else if (idCible) {
    const req = requetes.find(r => r.id === idCible);
    if (!req) {
      console.error(`❌ Requête "${idCible}" introuvable dans requetes.json`);
      console.log('IDs disponibles :', requetes.map(r => r.id).join(', '));
      process.exit(1);
    }
    requetesALancer = [req];
  } else {
    console.error('Usage : node geo-track.mjs --all [--model chatgpt|gemini|all]');
    console.error('        node geo-track.mjs <id-requete> [--model chatgpt|gemini|all]');
    process.exit(1);
  }

  // Charger historique
  let historique = {};
  if (existsSync(HISTORIQUE_PATH)) {
    historique = JSON.parse(readFileSync(HISTORIQUE_PATH, 'utf-8'));
  }

  const optsBrowser = {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  };

  // Un navigateur dédié par modèle — évite les conflits de contexte entre ChatGPT et Gemini
  const browsers = {};
  for (const model of modeles) {
    browsers[model] = await chromium.launch(optsBrowser);
  }

  // Pour Gemini : créer un context partagé unique et accepter les cookies une seule fois
  const contextes = {};
  if (modeles.includes('gemini')) {
    const sessionExiste = existsSync(GEMINI_SESSION_PATH);
    const ctxGemini = await browsers['gemini'].newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      ...(sessionExiste ? { storageState: GEMINI_SESSION_PATH } : {}),
    });
    // Accepter les cookies une seule fois sur une page temporaire
    const pageInit = await ctxGemini.newPage();
    await pageInit.goto('https://gemini.google.com/app', { waitUntil: 'networkidle', timeout: 40000 }).catch(() => null);
    await pageInit.waitForTimeout(3000);
    const cookiesCliques = await accepterCookiesGemini(pageInit);
    await pageInit.waitForTimeout(2000);
    await pageInit.close();
    // Sauvegarder la session après acceptation des cookies (pour les prochains runs)
    await ctxGemini.storageState({ path: GEMINI_SESSION_PATH });
    contextes['gemini'] = ctxGemini;
    if (cookiesCliques) {
      console.log('✅ Cookies Gemini acceptés et session sauvegardée');
    } else if (sessionExiste) {
      console.log('✅ Session Gemini restaurée depuis gemini-session.json');
    } else {
      console.log('✅ Context Gemini prêt (pas de bannière détectée)');
    }
  }

  // Requêtes en séquentiel, ChatGPT + Gemini en parallèle (chacun dans son propre navigateur)
  for (const requete of requetesALancer) {
    const taches = modeles.map(model => {
      const browserOrCtx = model === 'gemini' ? contextes['gemini'] : browsers[model];
      return lancerRequete(requete, historique, browserOrCtx, model).catch(err =>
        console.log(`⚠️  Erreur [${requete.id}/${model}] :`, err.message)
      );
    });
    await Promise.all(taches);
  }

  // Fermer les contextes Gemini partagés
  for (const ctx of Object.values(contextes)) await ctx.close();
  for (const model of modeles) {
    await browsers[model].close();
  }

  // Sauvegarder
  writeFileSync(HISTORIQUE_PATH, JSON.stringify(historique, null, 2), 'utf-8');
  console.log(`\n✅ historique.json mis à jour.`);

  // Auto-push vers GitHub Pages
  try {
    const { execSync } = await import('child_process');
    const { fileURLToPath } = await import('url');
    const gitDir = fileURLToPath(new URL('.', import.meta.url));
    const date = new Date().toISOString().slice(0, 10);
    const opts = { stdio: 'inherit', shell: true, cwd: gitDir };
    execSync('git add historique.json responses/', opts);
    // Commit uniquement s'il y a des changements staged
    try {
      execSync(`git commit -m "GEO update ${date}"`, opts);
    } catch (commitErr) {
      // "nothing to commit" n'est pas une erreur bloquante
      if (!commitErr.message?.includes('nothing to commit')) throw commitErr;
    }
    execSync('git push', opts);
    console.log('✅ Dashboard GitHub Pages mis à jour');
  } catch (e) {
    console.log('⚠️  Push git échoué :', e.message?.split('\n')[0] || e);
  }
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
