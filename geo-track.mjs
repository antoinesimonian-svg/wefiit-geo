/**
 * GEO Track — Lance 3 runs par requête et archive dans historique.json
 *
 * Usage :
 *   node geo-track.mjs --all          → toutes les requêtes
 *   node geo-track.mjs pm-general     → une requête spécifique
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const NB_RUNS = 3;
const BASE_DIR = 'c:/Users/AntoineSIMONIAN/.claude/projects/wefiit/geo-monitoring';
const REQUETES_PATH = `${BASE_DIR}/requetes.json`;
const HISTORIQUE_PATH = `${BASE_DIR}/historique.json`;
const SCREENSHOTS_BASE = `${BASE_DIR}/screenshots`;

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

function dateAujourdhui() {
  return new Date().toISOString().split('T')[0];
}

function detecterWefiit(texte) {
  for (const regex of MOTS_CLES_WEFIIT) {
    const match = texte.match(regex);
    if (match) {
      const index = match.index;
      // Extraire le bloc (paragraphe ou entrée de liste) qui contient la mention
      // On remonte jusqu'au saut de ligne précédent et on descend jusqu'au suivant
      const debutBloc = texte.lastIndexOf('\n', index - 1);
      const finBloc = texte.indexOf('\n', index);
      const ligneWefiit = texte.substring(
        debutBloc === -1 ? 0 : debutBloc + 1,
        finBloc === -1 ? texte.length : finBloc
      ).trim();
      // Si la ligne est trop courte (ex: juste "WeFiiT"), prendre aussi la ligne suivante
      let verbatim = ligneWefiit;
      if (verbatim.length < 40 && finBloc !== -1) {
        const finBloc2 = texte.indexOf('\n', finBloc + 1);
        const ligneSuivante = texte.substring(finBloc + 1, finBloc2 === -1 ? texte.length : finBloc2).trim();
        if (ligneSuivante.length > 0) verbatim += ' ' + ligneSuivante;
      }
      return { trouve: true, verbatim };
    }
  }
  return { trouve: false, verbatim: null };
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

async function lancerRequete(requete, historique, browser) {
  const { id, libelle } = requete;
  const dateJour = dateAujourdhui();

  // Initialiser la section si absente
  if (!historique[id]) {
    historique[id] = { libelle, runs: [] };
  }

  // Vérifier doublon
  if (historique[id].runs.find(r => r.date === dateJour)) {
    console.log(`⚠️  [${id}] Run déjà effectué aujourd'hui (${dateJour}) — ignoré.`);
    return;
  }

  console.log(`\n=== [${id}] "${libelle}" ===`);

  // Créer dossier screenshots
  const screenshotDir = `${SCREENSHOTS_BASE}/${id}`;
  if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const runs = [];

  for (let run = 1; run <= NB_RUNS; run++) {
    console.log(`  Run ${run}/${NB_RUNS}...`);
    let resultat = { run, statut: 'erreur', wefiitMentionne: false, verbatim: null, concurrents: {} };

    try {
      const page = await context.newPage();
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

      const selecteurInput = '#prompt-textarea, [contenteditable="true"][data-placeholder]';
      await page.waitForSelector(selecteurInput, { timeout: 20000 });

      const champSaisie = await page.$(selecteurInput);
      if (!champSaisie) throw new Error('Champ de saisie introuvable');

      await champSaisie.click();
      await page.keyboard.type(libelle, { delay: 30 });
      await page.waitForTimeout(500);

      const boutonEnvoi = await page.$('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Envoyer"]');
      if (boutonEnvoi) await boutonEnvoi.click();
      else await page.keyboard.press('Enter');

      const reponse = await attendreFinReponse(page);

      if (!reponse || reponse.length < 20) {
        resultat.statut = 'timeout';
      } else {
        resultat.statut = 'ok';
        const detection = detecterWefiit(reponse);
        resultat.wefiitMentionne = detection.trouve;
        resultat.verbatim = detection.verbatim;
        resultat.concurrents = extraireConcurrents(reponse);
        console.log(`  ${detection.trouve ? '✅ WeFiiT présent' : '❌ WeFiiT absent'}`);
      }

      await page.screenshot({ path: `${screenshotDir}/${dateJour}-run${run}.png`, fullPage: true });
      await page.close();
    } catch (err) {
      console.log(`  ❌ Erreur run ${run} : ${err.message}`);
      resultat.statut = 'erreur';
    }

    runs.push(resultat);
    if (run < NB_RUNS) await new Promise(r => setTimeout(r, 8000));
  }

  await context.close();

  // Agréger
  const runsOk = runs.filter(r => r.statut === 'ok');
  const citationsWefiit = runsOk.filter(r => r.wefiitMentionne).length;
  const verbatims = runsOk.filter(r => r.verbatim).map(r => r.verbatim);

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
  if (verbatims.length > 0) {
    verbatims.forEach((v, i) => console.log(`  Verbatim ${i + 1} : "${v.substring(0, 100)}..."`));
  }
  console.log(`  Concurrents : ${Object.entries(concurrentsTriees).slice(0, 5).map(([n, f]) => `${n} ${f}/${runsOk.length}`).join(', ')}`);

  // Archiver
  historique[id].runs.push({
    date: dateJour,
    runsOk: runsOk.length,
    wefiit: { citations: citationsWefiit, verbatims },
    concurrents: concurrentsTriees,
  });

  console.log(`  ✅ Archivé`);
}

async function main() {
  const args = process.argv.slice(2);
  const modeAll = args.includes('--all');
  const idCible = !modeAll && args[0] ? args[0] : null;

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
    console.log(`=== GEO Track --all : ${requetes.length} requêtes ===`);
  } else if (idCible) {
    const req = requetes.find(r => r.id === idCible);
    if (!req) {
      console.error(`❌ Requête "${idCible}" introuvable dans requetes.json`);
      console.log('IDs disponibles :', requetes.map(r => r.id).join(', '));
      process.exit(1);
    }
    requetesALancer = [req];
  } else {
    console.error('Usage : node geo-track.mjs --all   OU   node geo-track.mjs <id-requete>');
    process.exit(1);
  }

  // Charger historique
  let historique = {};
  if (existsSync(HISTORIQUE_PATH)) {
    historique = JSON.parse(readFileSync(HISTORIQUE_PATH, 'utf-8'));
  }

  // Lancer le navigateur (partagé entre requêtes)
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  for (const requete of requetesALancer) {
    await lancerRequete(requete, historique, browser);
    // Pause entre requêtes en mode --all
    if (modeAll && requetesALancer.indexOf(requete) < requetesALancer.length - 1) {
      console.log('\n⏳ Pause 15s avant la prochaine requête...');
      await new Promise(r => setTimeout(r, 15000));
    }
  }

  await browser.close();

  // Sauvegarder
  writeFileSync(HISTORIQUE_PATH, JSON.stringify(historique, null, 2), 'utf-8');
  console.log(`\n✅ historique.json mis à jour.`);

  // Auto-push vers GitHub Pages
  try {
    const { execSync } = await import('child_process');
    const date = new Date().toISOString().slice(0, 10);
    execSync(`git add historique.json && git commit -m "GEO update ${date}" && git push`, {
      stdio: 'inherit',
      shell: true,
      cwd: new URL('.', import.meta.url).pathname.replace(/^\//, '')
    });
    console.log('✅ Dashboard GitHub Pages mis à jour');
  } catch (e) {
    console.log('⚠️  Push git échoué — mise à jour manuelle requise');
  }
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
