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
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';
import { nettoyerTexte, detecterWefiit, extraireConcurrents, attendreFinReponseChatGPT, detecterRang } from './lib/geo-utils.mjs';
import { GoogleGenerativeAI } from '@google/generative-ai';

const NB_RUNS = 3;
const BASE_DIR = dirname(fileURLToPath(import.meta.url));
const REQUETES_PATH = `${BASE_DIR}/requetes.json`;
const HISTORIQUE_PATH = `${BASE_DIR}/historique.json`;
const SCREENSHOTS_BASE = `${BASE_DIR}/screenshots`;
const RESPONSES_BASE = `${BASE_DIR}/responses`;
const JOBS_PATH  = `${BASE_DIR}/jobs.json`;
const AUDIT_PATH = `${BASE_DIR}/audit.json`;
const RETRY_PENDING_PATH = `${BASE_DIR}/retry-pending.json`;
const RETRY_DELAY_MS = 60_000; // 1 minute

// Charger .env si présent
const ENV_PATH = `${BASE_DIR}/.env`;
if (existsSync(ENV_PATH)) {
  for (const ligne of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)\s*$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

// ─────────────────────────────────────────────
// Utilitaires communs
// ─────────────────────────────────────────────

function dateAujourdhui() {
  return new Date().toISOString().split('T')[0];
}

// ─────────────────────────────────────────────
// Telegram
// ─────────────────────────────────────────────

async function notifierTelegram(message) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // silencieux si non configuré
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
    if (!res.ok) console.log(`⚠️  Telegram : erreur ${res.status}`);
  } catch (err) {
    console.log(`⚠️  Telegram échoué : ${err.message}`);
  }
}

// ─────────────────────────────────────────────
// Audit — journal de jobs et de runs
// ─────────────────────────────────────────────

function generateJobId() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = randomBytes(3).toString('hex');
  return `job-${ts.slice(0, 8)}-${ts.slice(8, 14)}-${suffix}`;
}

function appendToLog(filePath, entry) {
  let arr = [];
  try {
    if (existsSync(filePath)) arr = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (_) { arr = []; }
  arr.push(entry);
  writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf-8');
}

function safeAppendToLog(filePath, entry) {
  try { appendToLog(filePath, entry); }
  catch (err) { console.log(`⚠️  Audit log write failed: ${err.message}`); }
}

// ─────────────────────────────────────────────
// ChatGPT
// ─────────────────────────────────────────────

async function runChatGPT(page, libelle) {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // ChatGPT utilise ProseMirror (#prompt-textarea.ProseMirror) — pas de data-placeholder
  // On attend que l'éditeur soit visible avant d'interagir
  const locator = page.locator('#prompt-textarea').first();
  await locator.waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);

  const visible = await locator.isVisible().catch(() => false);
  if (!visible) throw new Error('Champ de saisie introuvable');

  await locator.click();
  await page.keyboard.type(libelle, { delay: 30 });
  await page.waitForTimeout(500);

  const boutonEnvoi = await page.$('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Envoyer"]');
  if (boutonEnvoi) await boutonEnvoi.click();
  else await page.keyboard.press('Enter');

  return await attendreFinReponseChatGPT(page);
}

// ─────────────────────────────────────────────
// Gemini API (officielle)
// ─────────────────────────────────────────────

async function runGeminiAPI(libelle) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ googleSearch: {} }],
  });

  const result = await model.generateContent(libelle);
  const response = result.response;
  const texte = response.text();
  const groundingSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  console.log(`  🔍 Grounding: ${groundingSources.length} sources`);
  return { texte, groundingSources };
}


// ─────────────────────────────────────────────
// Orchestration par requête
// ─────────────────────────────────────────────

// context est soit un BrowserContext partagé (Gemini), soit un Browser (ChatGPT — crée un context par requête)
async function lancerRequete(requete, historique, browserOrContext, model = 'chatgpt', jobId = null, forceRerun = false) {
  const { id, libelle } = requete;
  const dateJour = dateAujourdhui();
  const pauseInterRuns = model === 'gemini' ? 4000 : 8000;

  // Initialiser la section si absente
  if (!historique[id]) {
    historique[id] = { libelle, runs: [] };
  }

  // Vérifier doublon (par date ET par modèle) — ignorer les entrées fantômes (runsOk: 0)
  if (!forceRerun && historique[id].runs.find(r => r.date === dateJour && (r.model ?? 'chatgpt') === model && r.runsOk > 0)) {
    console.log(`⚠️  [${id}/${model}] Run déjà effectué aujourd'hui (${dateJour}) — ignoré.`);
    safeAppendToLog(AUDIT_PATH, {
      jobId, requêteId: id, modèle: model, run: null,
      démarré: null, terminé: null, durée: null,
      statut: 'ignoré', wefiit: null, erreurDétail: null,
      cheminReponse: null, ignoré: true, raisonIgnoré: `duplicate:${dateJour}`,
    });
    return { ok: 0, timeout: 0, erreur: 0, loginWall: 0, ignoré: 1 };
  }

  console.log(`\n=== [${id}/${model}] "${libelle}" ===`);

  // Créer dossier screenshots (inclut le modèle pour éviter les collisions)
  const screenshotDir = `${SCREENSHOTS_BASE}/${id}/${model}`;
  if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

  const runs = [];

  for (let run = 1; run <= NB_RUNS; run++) {
    console.log(`  Run ${run}/${NB_RUNS}...`);
    const runDémarré = new Date();
    let resultat = { run, statut: 'erreur', wefiitMentionne: false, preview: null, cheminReponse: null, concurrents: {} };

    const MAX_TENTATIVES = 2;
    for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative++) {
      if (tentative > 1) {
        console.log(`  ↩️  Retry run ${run} (tentative ${tentative})...`);
        await new Promise(r => setTimeout(r, pauseInterRuns));
      }
      // ChatGPT : context frais par run (évite que ChatGPT ferme le context entre runs)
      const context = model === 'chatgpt'
        ? await browserOrContext.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 900 },
          })
        : null;
      try {
        const page = model !== 'gemini' ? await context.newPage() : null;

        let reponse = '';
        let groundingSources = [];
        if (model === 'gemini') {
          const res = await runGeminiAPI(libelle);
          reponse = res.texte;
          groundingSources = res.groundingSources;
        } else {
          reponse = await runChatGPT(page, libelle);
        }

        if (!reponse || reponse.length < 20) {
          resultat.statut = 'reponse_vide';
          resultat._erreurDétail = 'réponse vide ou trop courte';
          if (page) await page.screenshot({ path: `${screenshotDir}/${dateJour}-run${run}.png`, fullPage: true }).catch(() => null);
          if (page) await page.close();
          if (context) await context.close().catch(() => null);
          // pas de break : on retente sur la prochaine tentative
        } else {
          resultat.statut = 'ok';
          const reponseNettoyee = nettoyerTexte(reponse);
          const detection = detecterWefiit(reponse);
          resultat.wefiitMentionne = detection.trouve;
          resultat.preview = detection.preview;
          resultat.verbatim = reponseNettoyee.trim();
          resultat.groundingSources = groundingSources;
          resultat.concurrents = extraireConcurrents(reponse);
          const rangInfo = detecterRang(reponseNettoyee);
          resultat.rang = rangInfo.rang;
          resultat.totalCabinets = rangInfo.totalCabinets;

          // Sauvegarder la réponse complète dans un fichier texte
          if (!existsSync(RESPONSES_BASE)) mkdirSync(RESPONSES_BASE, { recursive: true });
          const cheminReponse = `${RESPONSES_BASE}/${id}-${dateJour}-${model}-run${run}.txt`;
          writeFileSync(cheminReponse, reponseNettoyee, 'utf-8');
          resultat.cheminReponse = `responses/${id}-${dateJour}-${model}-run${run}.txt`;

          console.log(`  ${detection.trouve ? '✅ WeFiiT présent' : '❌ WeFiiT absent'}`);
          if (page) {
            await page.screenshot({ path: `${screenshotDir}/${dateJour}-run${run}.png`, fullPage: true });
            await page.close();
          }
          if (context) await context.close();
          break; // run réussi — pas besoin de retry
        }
      } catch (err) {
        if (context) await context.close().catch(() => null);
        if (err.message === 'login-wall') {
          console.log(`  ⚠️  Login wall Gemini détecté — run ignoré`);
          resultat.statut = 'login-wall';
          resultat._erreurDétail = 'login-wall';
          break; // pas de retry sur login-wall
        } else if (err.message === 'gemini-timeout') {
          console.log(`  ⏱  Timeout Gemini (raison: ${err.timeoutRaison}) — run ${run}, tentative ${tentative}`);
          resultat.statut = 'timeout';
          resultat._erreurDétail = `gemini-timeout:${err.timeoutRaison}`;
          resultat._timeoutRaison = err.timeoutRaison;
          // pas de break : on retente sur la prochaine tentative
        } else {
          const msg = err.message ?? '';
          // Classification : erreur_ui si sélecteur/DOM cassé, erreur_reseau si connexion perdue
          if (msg.includes('net::ERR_') || msg.includes('ERR_INTERNET') || msg.includes('getaddrinfo')) {
            resultat.statut = 'erreur_reseau';
          } else if (msg.includes('selector') || msg.includes('waiting for') || msg.includes('locator') || msg.includes('element')) {
            resultat.statut = 'erreur_ui';
          } else {
            resultat.statut = 'erreur';
          }
          console.log(`  ❌ [${resultat.statut}] run ${run} (tentative ${tentative}) : ${msg}`);
          resultat._erreurDétail = msg;
        }
      }
    }

    runs.push(resultat);
    const runTerminé = new Date();
    safeAppendToLog(AUDIT_PATH, {
      jobId,
      requêteId: id,
      modèle: model,
      source: model === 'gemini' ? 'api' : 'playwright',
      run,
      démarré: runDémarré.toISOString(),
      terminé: runTerminé.toISOString(),
      durée: Math.round((runTerminé - runDémarré) / 1000),
      statut: resultat.statut,
      wefiit: resultat.wefiitMentionne ?? null,
      erreurDétail: resultat._erreurDétail ?? null,
      timeoutRaison: resultat._timeoutRaison ?? null,
      cheminReponse: resultat.cheminReponse ?? null,
      ignoré: false,
      raisonIgnoré: null,
    });
    if (run < NB_RUNS) await new Promise(r => setTimeout(r, pauseInterRuns));
  }

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

  // Rang moyen WeFiiT sur les runs où il apparaît dans une liste numérotée
  const runsAvecRang = runsOk.filter(r => r.rang > 0);
  const rangMoyen = runsAvecRang.length > 0
    ? Math.round(runsAvecRang.reduce((s, r) => s + r.rang, 0) / runsAvecRang.length)
    : null;
  const totalMoyenCabinets = runsAvecRang.length > 0
    ? Math.round(runsAvecRang.reduce((s, r) => s + r.totalCabinets, 0) / runsAvecRang.length)
    : null;

  // Rapport terminal
  console.log(`\n  WeFiiT : cité ${citationsWefiit}/${runsOk.length} fois`);
  if (rangMoyen) {
    console.log(`  Rang WeFiiT : #${rangMoyen} sur ~${totalMoyenCabinets} cabinets`);
  }
  if (previews.length > 0) {
    previews.forEach((v, i) => console.log(`  Preview ${i + 1} : "${v}"`));
  }
  console.log(`  Concurrents : ${Object.entries(concurrentsTriees).slice(0, 5).map(([n, f]) => `${n} ${f}/${runsOk.length}`).join(', ')}`);

  // N'archiver que si au moins un run a abouti (évite les entrées fantômes runsOk: 0)
  if (runsOk.length === 0) {
    console.log(`  ⚠️  Aucun run réussi — entrée non archivée dans historique.json`);
  } else {
    historique[id].runs.push({
      date: dateJour,
      model,
      runsOk: runsOk.length,
      wefiit: { citations: citationsWefiit, previews, reponsesChemins },
      verbatims,
      concurrents: concurrentsTriees,
      rang: rangMoyen,
      totalCabinets: totalMoyenCabinets,
    });
    console.log(`  ✅ Archivé`);
  }
  const STATUTS_RECUPERABLES = ['timeout', 'reponse_vide', 'erreur_reseau'];
  const STATUTS_UI = ['erreur_ui'];
  return {
    ok: runs.filter(r => r.statut === 'ok').length,
    timeout: runs.filter(r => r.statut === 'timeout').length,
    reponseVide: runs.filter(r => r.statut === 'reponse_vide').length,
    erreurReseau: runs.filter(r => r.statut === 'erreur_reseau').length,
    erreurUi: runs.filter(r => r.statut === 'erreur_ui').length,
    erreur: runs.filter(r => r.statut === 'erreur').length,
    loginWall: runs.filter(r => r.statut === 'login-wall').length,
    ignoré: 0,
    recuperable: runs.filter(r => STATUTS_RECUPERABLES.includes(r.statut)).length,
    uiCasse: runs.filter(r => STATUTS_UI.includes(r.statut)).length,
  };
}

// ─────────────────────────────────────────────
// Détection des régressions
// ─────────────────────────────────────────────

function detecterRegressions(historique, requetes) {
  const regressions = [];
  for (const req of requetes) {
    const { id } = req;
    if (!historique[id]) continue;
    const runs = historique[id].runs.filter(r => r.runsOk > 0);
    if (runs.length < 2) continue;

    for (const model of ['chatgpt', 'gemini']) {
      const runsModele = runs
        .filter(r => (r.model ?? 'chatgpt') === model)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (runsModele.length < 2) continue;

      const [dernier, precedent] = runsModele;
      const delta = dernier.wefiit.citations - precedent.wefiit.citations;

      if (delta < 0) {
        regressions.push({
          id,
          model,
          avant: `${precedent.wefiit.citations}/${precedent.runsOk}`,
          apres: `${dernier.wefiit.citations}/${dernier.runsOk}`,
          dateAvant: precedent.date,
          dateApres: dernier.date,
        });
      }
    }
  }
  return regressions;
}

// ─────────────────────────────────────────────
// Auto-healing — analyse erreur_ui via Claude Haiku
// ─────────────────────────────────────────────

async function analyserErreursPersistantes(jobId, manquants) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  let auditEntries = [];
  try {
    auditEntries = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8'));
  } catch (_) { return null; }

  // Toutes les erreurs persistantes sauf erreur_reseau (Claude ne peut rien y faire)
  const erreurs = auditEntries.filter(e =>
    e.jobId === jobId &&
    e.statut !== 'ok' &&
    e.statut !== 'ignoré' &&
    e.statut !== 'erreur_reseau' &&
    manquants.some(m => m.id === e.requêteId && m.model === e.modèle)
  );
  if (erreurs.length === 0) return null;

  const sélecteursActuels = {
    chatgpt: '#prompt-textarea',
    gemini: 'rich-textarea [contenteditable]',
  };

  const contexte = erreurs.slice(0, 5).map(e =>
    `Modèle: ${e.modèle} | Statut: ${e.statut} | Erreur: ${e.erreurDétail ?? 'aucun détail'}`
  ).join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        messages: [{
          role: 'user',
          content: `Tu es expert Playwright. Voici des erreurs persistantes sur un script de monitoring GEO (scraping ChatGPT + Gemini API).

Sélecteurs actuels :
- ChatGPT input : "${sélecteursActuels.chatgpt}"
- Gemini : API officielle (pas de sélecteur)

Erreurs après retry :
${contexte}

Propose un diagnostic court et 1-3 actions correctives concrètes. Format : liste à puces, max 5 lignes.`,
        }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text ?? null;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────
// Eval — complétude du run
// ─────────────────────────────────────────────

function evalCompletude(historique, requetes, modeles, dateJour) {
  const manquants = [];
  for (const req of requetes) {
    for (const model of modeles) {
      const runs = historique[req.id]?.runs ?? [];
      const aRunOk = runs.some(r => r.date === dateJour && (r.model ?? 'chatgpt') === model && r.runsOk > 0);
      if (!aRunOk) manquants.push({ id: req.id, libelle: req.libelle, model });
    }
  }
  return manquants;
}

// ─────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // ─── Mode --retry-failed ───────────────────────────────────────────────────
  if (args.includes('--retry-failed')) {
    if (!existsSync(RETRY_PENDING_PATH)) {
      console.log('ℹ️  Aucun retry-pending.json trouvé — rien à relancer.');
      process.exit(0);
    }
    let pending;
    try {
      pending = JSON.parse(readFileSync(RETRY_PENDING_PATH, 'utf-8'));
    } catch (e) {
      console.error('❌ retry-pending.json invalide :', e.message);
      process.exit(1);
    }
    console.log(`=== GEO Track --retry-failed : ${pending.manquants.length} combinaison(s) à relancer ===`);
    for (const m of pending.manquants) console.log(`   - ${m.id}/${m.model}`);

    let historique = {};
    if (existsSync(HISTORIQUE_PATH)) {
      historique = JSON.parse(readFileSync(HISTORIQUE_PATH, 'utf-8'));
    }

    const modelesPending = [...new Set(pending.manquants.map(m => m.model))];
    const browsers = {};
    if (modelesPending.includes('chatgpt')) {
      browsers['chatgpt'] = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
    }

    const jobId = generateJobId();
    for (const { id, libelle, model } of pending.manquants) {
      const browserOrCtx = model === 'chatgpt' ? browsers['chatgpt'] : null;
      try {
        await lancerRequete({ id, libelle }, historique, browserOrCtx, model, jobId, true);
      } catch (err) {
        console.log(`⚠️  [${id}/${model}] :`, err.message);
      }
    }

    for (const browser of Object.values(browsers)) await browser.close();

    // Sauvegarder historique
    const tmp = HISTORIQUE_PATH + '.tmp';
    writeFileSync(tmp, JSON.stringify(historique, null, 2), 'utf-8');
    renameSync(tmp, HISTORIQUE_PATH);

    // Vérifier si tout est ok maintenant
    const dateJour = dateAujourdhui();
    const modelesTous = [...new Set(pending.manquants.map(m => m.model))];
    const requetesTous = pending.manquants.map(m => ({ id: m.id, libelle: m.libelle }));
    const encoreManquants = evalCompletude(historique, requetesTous, modelesTous, dateJour);

    if (encoreManquants.length === 0) {
      console.log('✅ Retry manuel réussi — toutes les combinaisons ok.');
      try { const { unlinkSync } = await import('fs'); unlinkSync(RETRY_PENDING_PATH); } catch (_) {}
      await notifierTelegram(`✅ <b>GEO Retry manuel réussi</b> — ${dateJour}\nToutes les combinaisons récupérées.`);
    } else {
      console.log(`⚠️  Encore ${encoreManquants.length} manquant(s) — retry-pending.json mis à jour.`);
      writeFileSync(RETRY_PENDING_PATH, JSON.stringify({ créé: new Date().toISOString(), jobIdOrigine: jobId, manquants: encoreManquants }, null, 2), 'utf-8');
      await notifierTelegram(`⚠️ <b>GEO Retry manuel partiel</b> — ${dateJour}\nEncore manquant(s) : ${encoreManquants.map(m => `${m.id}/${m.model}`).join(', ')}`);
    }
    process.exit(0);
  }
  // ──────────────────────────────────────────────────────────────────────────

  const modeAll = args.includes('--all');
  const idCible = !modeAll && args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--model') || null;

  // Parsing --force
  const forceRerun = args.includes('--force');

  // Parsing --model
  const modelIdx = args.indexOf('--model');
  const modelArg = modelIdx !== -1 ? args[modelIdx + 1] : 'chatgpt';
  if (!['chatgpt', 'gemini', 'all'].includes(modelArg)) {
    console.error('❌ --model doit être : chatgpt | gemini | all');
    process.exit(1);
  }
  const modeles = modelArg === 'all' ? ['chatgpt', 'gemini'] : [modelArg];

  // Vérifier la clé API Gemini au démarrage (fail fast)
  if (modeles.includes('gemini') && !process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY absente. Créer geo-monitoring/.env avec GEMINI_API_KEY=<clé depuis aistudio.google.com>');
    process.exit(1);
  }

  // Charger config requêtes
  if (!existsSync(REQUETES_PATH)) {
    console.error('❌ requetes.json introuvable');
    process.exit(1);
  }
  let requetes;
  try {
    requetes = JSON.parse(readFileSync(REQUETES_PATH, 'utf-8'));
  } catch (e) {
    console.error('❌ requetes.json invalide :', e.message);
    process.exit(1);
  }

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
    try {
      historique = JSON.parse(readFileSync(HISTORIQUE_PATH, 'utf-8'));
    } catch (e) {
      console.error('❌ historique.json invalide ou corrompu :', e.message);
      process.exit(1);
    }
  }

  const jobId = generateJobId();
  const jobDémarré = new Date();
  const modeLabel = process.argv.slice(2).join(' ');
  const résumé = { ok: 0, timeout: 0, erreur: 0, ignoré: 0 };

  const optsBrowser = {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  };

  // Playwright uniquement pour ChatGPT — Gemini utilise l'API
  const browsers = {};
  if (modeles.includes('chatgpt')) {
    browsers['chatgpt'] = await chromium.launch(optsBrowser);
  }

  // Requêtes en séquentiel, ChatGPT + Gemini en parallèle si les deux sont demandés
  for (const requete of requetesALancer) {
    const taches = modeles.map(model => {
      const browserOrCtx = model === 'chatgpt' ? browsers['chatgpt'] : null;
      return lancerRequete(requete, historique, browserOrCtx, model, jobId, forceRerun)
        .then(r => {
          if (r) {
            résumé.ok      += r.ok;
            résumé.timeout += r.timeout;
            résumé.erreur  += (r.erreur ?? 0) + (r.loginWall ?? 0);
            résumé.ignoré  += r.ignoré;
          }
        })
        .catch(err => console.log(`⚠️  Erreur [${requete.id}/${model}] :`, err.message));
    });
    await Promise.all(taches);
  }

  // ─── Eval 1 : Complétude + Auto-retry ───────────────────────────────────────

  const dateJour = dateAujourdhui();
  const manquants = evalCompletude(historique, requetesALancer, modeles, dateJour);

  if (manquants.length > 0) {
    console.log(`\n⚠️  EVAL COMPLÉTUDE : ${manquants.length} combinaison(s) manquante(s) :`);
    for (const m of manquants) console.log(`   - ${m.id}/${m.model}`);

    // Écrire retry-pending.json
    writeFileSync(RETRY_PENDING_PATH, JSON.stringify({
      créé: new Date().toISOString(),
      jobIdOrigine: jobId,
      manquants,
    }, null, 2), 'utf-8');
    console.log(`⏳ Retry dans 1 min...`);

    // Auto-retry après 1 minute
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    console.log(`\n🔄 RETRY AUTOMATIQUE — relance des ${manquants.length} combinaison(s) manquante(s)`);

    for (const { id, libelle, model } of manquants) {
      const req = { id, libelle };
      const browserOrCtx = model === 'chatgpt' ? browsers['chatgpt'] : null;
      try {
        const r = await lancerRequete(req, historique, browserOrCtx, model, jobId, true);
        if (r) {
          résumé.ok      += r.ok;
          résumé.timeout += r.timeout;
          résumé.erreur  += (r.erreur ?? 0) + (r.loginWall ?? 0);
          résumé.ignoré  += r.ignoré;
        }
      } catch (err) {
        console.log(`⚠️  Retry [${id}/${model}] échoué :`, err.message);
      }
    }

    // Re-vérifier après retry
    const encoreManquants = evalCompletude(historique, requetesALancer, modeles, dateJour);
    if (encoreManquants.length === 0) {
      console.log(`✅ Retry réussi — run complet !`);
      try { const { unlinkSync } = await import('fs'); unlinkSync(RETRY_PENDING_PATH); } catch (_) {}
      await notifierTelegram(`✅ <b>GEO Run complet</b> — ${dateJour}\nRun partiel récupéré après retry automatique.\n${requetesALancer.length * modeles.length}/${requetesALancer.length * modeles.length} combinaisons ok.`);
    } else {
      console.log(`⚠️  Retry partiel — ${encoreManquants.length} combinaison(s) encore manquante(s) :`);
      for (const m of encoreManquants) console.log(`   - ${m.id}/${m.model}`);
      console.log(`   → retry-pending.json conservé pour le prochain lancement`);
      writeFileSync(RETRY_PENDING_PATH, JSON.stringify({
        créé: new Date().toISOString(),
        jobIdOrigine: jobId,
        manquants: encoreManquants,
      }, null, 2), 'utf-8');

      const listeManquants = encoreManquants.map(m => `• ${m.id}/${m.model}`).join('\n');

      // Auto-healing : demander à Claude Haiku un diagnostic sur toutes les erreurs persistantes
      const fixProposé = await analyserErreursPersistantes(jobId, encoreManquants);
      const sectionFix = fixProposé
        ? `\n\n🔧 <b>Fix proposé par Claude :</b>\n<code>${fixProposé.slice(0, 400)}</code>\n\n→ Appliquer manuellement dans geo-track.mjs`
        : '';

      await notifierTelegram(`⚠️ <b>GEO Run partiel</b> — ${dateJour}\n\nEncore manquant(s) après retry :\n${listeManquants}${sectionFix}\n\n→ Détails : geo-monitoring/audit.json`);
    }
  } else {
    console.log(`\n✅ EVAL COMPLÉTUDE : run complet (${requetesALancer.length * modeles.length}/${requetesALancer.length * modeles.length} combinaisons ok)`);
    try { if (existsSync(RETRY_PENDING_PATH)) { const { unlinkSync } = await import('fs'); unlinkSync(RETRY_PENDING_PATH); } } catch (_) {}

    // Notif résumé succès
    const citationsTotal = requetesALancer.reduce((sum, req) => {
      const runs = historique[req.id]?.runs ?? [];
      const derniers = modeles.map(m => runs.filter(r => r.date === dateJour && (r.model ?? 'chatgpt') === m).pop()).filter(Boolean);
      return sum + derniers.reduce((s, r) => s + (r.wefiit?.citations ?? 0), 0);
    }, 0);
    await notifierTelegram(`✅ <b>GEO Run complet</b> — ${dateJour}\n${requetesALancer.length * modeles.length}/${requetesALancer.length * modeles.length} combinaisons ok\nWeFiiT cité : ${citationsTotal} fois\n💡 Dashboard : https://open-seo.wefiit-dash.workers.dev`);
  }

  // Fermer les browsers Playwright (ChatGPT uniquement)
  for (const browser of Object.values(browsers)) await browser.close();

  // Sauvegarder — écriture atomique pour éviter la corruption si CTRL+C pendant l'écriture
  const historiqueTemp = HISTORIQUE_PATH + '.tmp';
  writeFileSync(historiqueTemp, JSON.stringify(historique, null, 2), 'utf-8');
  renameSync(historiqueTemp, HISTORIQUE_PATH);
  console.log(`\n✅ historique.json mis à jour.`);

  // Sync vers open-seo/public/ pour que le dashboard soit toujours à jour
  try {
    const openSeoPublic = join(BASE_DIR, '../open-seo/public');
    const openSeoCopy = join(openSeoPublic, 'historique.json');
    copyFileSync(HISTORIQUE_PATH, openSeoCopy);
    console.log('  → Copie synchro open-seo/public/historique.json ✓');

    // Sync des fichiers responses/ vers open-seo/public/responses/
    const openSeoResponses = join(openSeoPublic, 'responses');
    if (!existsSync(openSeoResponses)) mkdirSync(openSeoResponses, { recursive: true });
    const { readdirSync } = await import('fs');
    for (const f of readdirSync(RESPONSES_BASE)) {
      const dest = join(openSeoResponses, f);
      if (!existsSync(dest)) {
        copyFileSync(join(RESPONSES_BASE, f), dest);
      }
    }
    console.log('  → Copie synchro open-seo/public/responses/ ✓');
  } catch (_) {
    // Silencieux si open-seo n'est pas présent (autre machine, CI...)
  }

  // Détecter et afficher les régressions
  const regressions = detecterRegressions(historique, requetesALancer);
  if (regressions.length > 0) {
    console.log('\n⚠️  RÉGRESSIONS DÉTECTÉES :');
    for (const r of regressions) {
      console.log(`  ❌ [${r.id}/${r.model}] ${r.avant} → ${r.apres} (${r.dateAvant} → ${r.dateApres})`);
    }
    console.log('  → Vérifier le dashboard : https://antoinesimonian-svg.github.io/wefiit-geo/dashboard.html');
  } else {
    console.log('\n✅ Pas de régression détectée.');
  }

  // Journal de job
  const jobTerminé = new Date();
  const manquantsFinaux = evalCompletude(historique, requetesALancer, modeles, dateAujourdhui());
  safeAppendToLog(JOBS_PATH, {
    jobId,
    démarré: jobDémarré.toISOString(),
    terminé: jobTerminé.toISOString(),
    durée: Math.round((jobTerminé - jobDémarré) / 1000),
    mode: modeLabel,
    requêtes: requetesALancer.length,
    modèles: modeles,
    statut: manquantsFinaux.length === 0 ? 'succès' : 'partiel',
    résumé,
    evals: {
      completude: {
        attendu: requetesALancer.length * modeles.length,
        ok: requetesALancer.length * modeles.length - manquantsFinaux.length,
        manquants: manquantsFinaux.map(m => `${m.id}/${m.model}`),
      },
      anomalies: regressions.length > 0 ? regressions.map(r => `${r.id}/${r.model}: ${r.avant}→${r.apres}`) : [],
    },
    regressions: regressions.length > 0 ? regressions : null,
  });

  // Auto-push vers GitHub Pages
  try {
    const { execSync, spawnSync } = await import('child_process');
    const date = new Date().toISOString().slice(0, 10);
    const opts = { stdio: 'inherit', shell: true, cwd: BASE_DIR };
    execSync('git add historique.json responses/ jobs.json audit.json', opts);
    // Commit uniquement s'il y a des changements staged
    try {
      execSync(`git commit -m "GEO update ${date}"`, opts);
    } catch (commitErr) {
      // "nothing to commit" n'est pas une erreur bloquante
      if (!commitErr.message?.includes('nothing to commit')) throw commitErr;
    }
    // Push avec timeout 30s — un push gelé ne doit pas bloquer la fin du script
    const pushResult = spawnSync('git', ['push'], {
      stdio: 'inherit',
      shell: true,
      cwd: BASE_DIR,
      timeout: 30000,
    });
    if (pushResult.error?.code === 'ETIMEDOUT' || pushResult.status !== 0) {
      console.log('⚠️  Push git échoué ou timeout (30s) — historique.json local à jour, push manuel requis');
    } else {
      console.log('✅ Dashboard GitHub Pages mis à jour');
    }
  } catch (e) {
    console.log('⚠️  Push git échoué :', e.message?.split('\n')[0] || e);
  }

  // Auto-push historique.json vers open-seo (déclenche le déploiement Cloudflare)
  try {
    const { copyFileSync } = await import('fs');
    const { execSync, spawnSync } = await import('child_process');
    const date = new Date().toISOString().slice(0, 10);
    const openSeoDir = `${BASE_DIR}/../open-seo`;
    const dest = `${openSeoDir}/public/historique.json`;
    copyFileSync(HISTORIQUE_PATH, dest);
    const optsOpenSeo = { stdio: 'inherit', shell: true, cwd: openSeoDir };
    execSync('git add public/historique.json', optsOpenSeo);
    try {
      execSync(`git commit -m "data(geo): run du ${date}"`, optsOpenSeo);
    } catch (commitErr) {
      if (!commitErr.message?.includes('nothing to commit')) throw commitErr;
    }
    const pushOpenSeo = spawnSync('git', ['push'], {
      stdio: 'inherit',
      shell: true,
      cwd: openSeoDir,
      timeout: 30000,
    });
    if (pushOpenSeo.error?.code === 'ETIMEDOUT' || pushOpenSeo.status !== 0) {
      console.log('⚠️  Push open-seo échoué ou timeout (30s) — push manuel requis');
    } else {
      console.log('✅ Dashboard open-seo mis à jour (Cloudflare déploiement déclenché)');
    }
  } catch (e) {
    console.log('⚠️  Sync open-seo échoué :', e.message?.split('\n')[0] || e);
  }
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
