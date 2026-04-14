/**
 * GEO Positioning — Test multi-run sur une requete
 * Lance N fois la meme requete sur ChatGPT (mode guest) pour calculer une moyenne.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const REQUETE = 'meilleur cabinet conseil product management';
const NB_RUNS = 3;
const SCREENSHOT_DIR = 'c:/Users/AntoineSIMONIAN/.claude/projects/wefiit/tmp/geo-screenshots';
const RESULTATS_PATH = 'c:/Users/AntoineSIMONIAN/.claude/projects/wefiit/tmp/geo-multi-resultats.json';

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
  'Product Squad', 'Maestro', 'ProductBoard',
  'Mind7', 'Ideo', 'Pivotal', 'Thoughtworks',
  'Wivoo', 'Mozza', 'Delva', 'Swood', 'Yield Studio', 'Yeita', 'IKXO',
  '5 Degres', 'Monsieur Guiz', 'BAM', 'Niji',
  'Product People', 'Mind the Product', 'Werin Group',
];

function detecterWefiit(texte) {
  for (const regex of MOTS_CLES_WEFIIT) {
    const match = texte.match(regex);
    if (match) {
      const index = match.index;
      const debut = texte.lastIndexOf('.', index - 1);
      const fin = texte.indexOf('.', index);
      const phrase = texte.substring(
        debut === -1 ? 0 : debut + 1,
        fin === -1 ? texte.length : fin + 1
      ).trim();
      return { trouve: true, verbatim: phrase, position: index };
    }
  }
  return { trouve: false, verbatim: null, position: null };
}

function extraireConcurrents(texte) {
  const trouves = {};
  for (const nom of CONCURRENTS_CONNUS) {
    const regex = new RegExp(nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = texte.match(regex);
    if (matches) {
      trouves[nom] = matches.length;
    }
  }
  return trouves;
}

// Detecter le rang de WeFiiT dans une liste numerotee
function detecterRang(texte) {
  // Chercher des patterns type "3. WeFiiT" ou "WeFiiT" dans une liste ordonnee
  const lignes = texte.split('\n');
  let rang = 0;
  let totalCabinets = 0;
  for (const ligne of lignes) {
    // Detecter les elements de liste numerotee ou avec emoji
    const matchNumero = ligne.match(/^(\d+)\.\s/);
    const matchEmoji = ligne.match(/^[🥇🥈🥉⭐🧩⚙️🎯📊🏢🔹🔵🟣🟢🟡]/u);
    if (matchNumero || matchEmoji) {
      totalCabinets++;
      if (/wefiit/i.test(ligne)) {
        rang = totalCabinets;
      }
    }
  }
  return { rang, totalCabinets };
}

async function attendreFinReponse(page, timeout = 60000) {
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

async function main() {
  console.log(`=== GEO Multi-Run — "${REQUETE}" x${NB_RUNS} ===`);
  console.log(`Date : ${new Date().toISOString().split('T')[0]}\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const resultats = [];

  for (let run = 1; run <= NB_RUNS; run++) {
    console.log(`\n--- Run ${run}/${NB_RUNS} ---`);
    let resultat = {
      run,
      requete: REQUETE,
      statut: 'erreur',
      wefiitMentionne: false,
      rangWefiit: null,
      totalCabinets: null,
      verbatim: null,
      concurrents: {},
      reponseComplete: '',
      notes: '',
    };

    try {
      const page = await context.newPage();
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

      const selecteurInput = '#prompt-textarea, [contenteditable="true"][data-placeholder]';
      await page.waitForSelector(selecteurInput, { timeout: 20000 });

      const pageContent = await page.content();
      if (pageContent.includes('captcha') || pageContent.includes('cf-challenge')) {
        console.log('  ⚠️ Captcha detecte');
        resultat.statut = 'captcha';
        resultat.notes = 'Captcha bloquant';
        resultats.push(resultat);
        await page.close();
        await new Promise(r => setTimeout(r, 8000));
        continue;
      }

      const champSaisie = await page.$(selecteurInput);
      if (!champSaisie) {
        resultat.statut = 'erreur';
        resultat.notes = 'Champ de saisie introuvable';
        resultats.push(resultat);
        await page.close();
        continue;
      }

      await champSaisie.click();
      await page.keyboard.type(REQUETE, { delay: 30 });
      await page.waitForTimeout(500);

      const boutonEnvoi = await page.$('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Envoyer"]');
      if (boutonEnvoi) {
        await boutonEnvoi.click();
      } else {
        await page.keyboard.press('Enter');
      }

      console.log('  Requete envoyee, attente...');
      const reponse = await attendreFinReponse(page, 90000);

      if (!reponse || reponse.length < 20) {
        resultat.statut = 'timeout';
        resultat.notes = 'Reponse vide ou timeout';
      } else {
        resultat.reponseComplete = reponse;
        resultat.statut = 'ok';

        const detection = detecterWefiit(reponse);
        resultat.wefiitMentionne = detection.trouve;
        resultat.verbatim = detection.verbatim;

        const rangInfo = detecterRang(reponse);
        resultat.rangWefiit = detection.trouve ? rangInfo.rang : null;
        resultat.totalCabinets = rangInfo.totalCabinets;

        resultat.concurrents = extraireConcurrents(reponse);

        if (detection.trouve) {
          console.log(`  ✅ WeFiiT PRESENT (rang ${rangInfo.rang || '?'}/${rangInfo.totalCabinets})`);
        } else {
          const noms = Object.keys(resultat.concurrents).slice(0, 5).join(', ');
          console.log(`  ❌ WeFiiT absent. Top concurrents : ${noms || 'aucun'}`);
        }
      }

      const screenshotPath = `${SCREENSHOT_DIR}/multi-run-${run}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  📸 ${screenshotPath}`);

      await page.close();
    } catch (err) {
      console.log(`  ❌ Erreur : ${err.message}`);
      resultat.statut = 'erreur';
      resultat.notes = err.message;
    }

    resultats.push(resultat);

    // Pause plus longue entre les runs (eviter rate limiting)
    if (run < NB_RUNS) {
      console.log('  ⏳ Pause 8s...');
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  await browser.close();

  // Sauvegarder
  writeFileSync(RESULTATS_PATH, JSON.stringify(resultats, null, 2), 'utf-8');

  // === RESUME ===
  const runsOk = resultats.filter(r => r.statut === 'ok');
  const wefiitRuns = runsOk.filter(r => r.wefiitMentionne);
  const tauxPresence = runsOk.length > 0 ? Math.round(wefiitRuns.length / runsOk.length * 100) : 0;

  // Frequence de chaque concurrent
  const freqConcurrents = {};
  runsOk.forEach(r => {
    Object.keys(r.concurrents).forEach(nom => {
      if (!freqConcurrents[nom]) freqConcurrents[nom] = 0;
      freqConcurrents[nom]++;
    });
  });
  const concurrentsTriees = Object.entries(freqConcurrents).sort((a, b) => b[1] - a[1]);

  console.log('\n========================================');
  console.log(`RESUME — "${REQUETE}" x${NB_RUNS}`);
  console.log('========================================');
  console.log(`Runs reussis : ${runsOk.length}/${NB_RUNS}`);
  console.log(`WeFiiT present : ${wefiitRuns.length}/${runsOk.length} (${tauxPresence}%)`);
  if (wefiitRuns.length > 0) {
    const rangs = wefiitRuns.map(r => r.rangWefiit).filter(Boolean);
    if (rangs.length > 0) {
      const rangMoyen = (rangs.reduce((a, b) => a + b, 0) / rangs.length).toFixed(1);
      console.log(`Rang moyen WeFiiT : ${rangMoyen}`);
    }
  }
  console.log('\nFrequence concurrents (sur ' + runsOk.length + ' runs) :');
  concurrentsTriees.forEach(([nom, freq]) => {
    console.log(`  ${nom} : ${freq}/${runsOk.length} (${Math.round(freq / runsOk.length * 100)}%)`);
  });
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
