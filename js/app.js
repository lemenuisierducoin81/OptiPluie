/* ===========================================================
   OptiPluie — js/app.js
   Relevé et classification des précipitations.
   Le Menuisier du Coin — Alban (81)
   =========================================================== */

const App = (function () {

  const VERSION  = '1.0';
  const CLE_DATA = 'optipluie_releves';
  const CLE_SEUI = 'optipluie_seuils';
  const CLE_ETAT = 'optipluie_etat';

  const MOIS   = ['janvier','février','mars','avril','mai','juin',
                  'juillet','août','septembre','octobre','novembre','décembre'];
  const MOIS_C = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  const MOIS_3 = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const JSEM   = ['L','M','M','J','V','S','D'];

  const SEUILS_DEFAUT = [1, 5, 15, 30];   /* Traces / Faible / Modérée / Forte */
  const NOMS = ['Sec','Traces','Faible','Modérée','Forte','Très forte'];
  const CSS  = ['sec','traces','faible','moderee','forte','tforte'];

  let releves = [];                       /* y compris les lignes supprimées */
  let seuils  = SEUILS_DEFAUT.slice();
  let etat    = {derniereSync: '', enAttente: false};
  let calRef  = new Date();
  let minuteur = null;

  /* ===================== Petits utilitaires ===================== */

  function $(id) { return document.getElementById(id); }

  function echap(t) {
    return String(t == null ? '' : t)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function fmt(n) {
    if (n == null || isNaN(n)) return '—';
    return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
  }

  function fmtCourt(n) {
    const a = Math.round(n * 10) / 10;
    return (a % 1 === 0 ? String(a) : a.toFixed(1).replace('.', ','));
  }

  function iso(d) {
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function aujIso() { return iso(new Date()); }

  function isoMoins(jours) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - jours);
    return iso(d);
  }

  function dateFR(i) { const p = i.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

  function dateCourte(i) { const p = i.split('-'); return p[2] + '/' + p[1]; }

  function eclair(txt, erreur) {
    const e = $('eclair');
    e.textContent = txt;
    e.classList.toggle('err', !!erreur);
    e.classList.add('on');
    clearTimeout(e._t);
    e._t = setTimeout(function () { e.classList.remove('on'); }, erreur ? 5200 : 2600);
  }

  /* ===================== Classification ===================== */

  function indexClasse(mm) {
    if (!(mm > 0)) return 0;
    for (let i = 0; i < seuils.length; i++) if (mm <= seuils[i]) return i + 1;
    return 5;
  }

  function classe(mm) {
    const i = indexClasse(mm);
    return {i: i, nom: NOMS[i], css: CSS[i]};
  }

  function bornes(i) {
    if (i === 0) return '0 mm';
    if (i === 5) return '+ ' + fmtCourt(seuils[3]) + ' mm';
    const bas = i === 1 ? 0.1 : seuils[i - 2];
    return fmtCourt(bas) + ' à ' + fmtCourt(seuils[i - 1]) + ' mm';
  }

  /* ===================== Stockage local ===================== */

  function charger() {
    try { releves = JSON.parse(localStorage.getItem(CLE_DATA)) || []; } catch (e) { releves = []; }
    if (!Array.isArray(releves)) releves = [];

    try {
      const s = JSON.parse(localStorage.getItem(CLE_SEUI));
      if (Array.isArray(s) && s.length === 4 && s.every(function (x) { return typeof x === 'number'; })) seuils = s;
    } catch (e) { /* seuils par défaut */ }

    try { etat = Object.assign(etat, JSON.parse(localStorage.getItem(CLE_ETAT)) || {}); } catch (e) {}

    trier();
  }

  function trier() { releves.sort(function (a, b) { return a.d < b.d ? 1 : -1; }); }

  function sauver() {
    try { localStorage.setItem(CLE_DATA, JSON.stringify(releves)); }
    catch (e) { eclair('Enregistrement impossible sur cet appareil', true); }
  }

  function sauverEtat() {
    try { localStorage.setItem(CLE_ETAT, JSON.stringify(etat)); } catch (e) {}
  }

  function actifs() { return releves.filter(function (e) { return !e.supp; }); }

  function trouver(d) { return releves.find(function (e) { return e.d === d; }); }

  /* ===================== Statistiques ===================== */

  function stats(liste) {
    const pluie = liste.filter(function (e) { return e.mm > 0; });
    const cumul = pluie.reduce(function (s, e) { return s + e.mm; }, 0);
    let max = null;
    pluie.forEach(function (e) { if (!max || e.mm > max.mm) max = e; });
    return {cumul: cumul, jours: pluie.length, max: max, saisies: liste.length};
  }

  function periode(jours) {
    const deb = isoMoins(jours - 1), fin = aujIso();
    return stats(actifs().filter(function (e) { return e.d >= deb && e.d <= fin; }));
  }

  function statsAnnee(a) {
    return stats(actifs().filter(function (e) { return e.d.slice(0, 4) === String(a); }));
  }

  function statsMois(a, m) {
    const p = String(a) + '-' + String(m + 1).padStart(2, '0');
    return stats(actifs().filter(function (e) { return e.d.slice(0, 7) === p; }));
  }

  function anneesConnues() {
    const an = [...new Set(actifs().map(function (e) { return e.d.slice(0, 4); }))].sort().reverse();
    const courante = String(new Date().getFullYear());
    if (!an.includes(courante)) an.unshift(courante);
    return an;
  }

  /* ===================== Saisie ===================== */

  function enregistrer() {
    const d    = $('fDate').value;
    const brut = String($('fMm').value).replace(',', '.').trim();
    const note = $('fNote').value.trim();

    if (!d) { eclair('Indique une date', true); return; }
    if (brut === '') { eclair('Indique une hauteur en mm', true); return; }

    const mm = parseFloat(brut);
    if (isNaN(mm) || mm < 0) { eclair('Hauteur non valide', true); return; }
    if (mm > 500 && !confirm(fmt(mm) + ' mm sur une journée, c\'est énorme.\nConfirmer cette valeur ?')) return;

    const existant = trouver(d);

    if (existant && !existant.supp) {
      const remplacer = confirm(
        'Un relevé existe déjà au ' + dateFR(d) + ' : ' + fmt(existant.mm) + ' mm.\n\n' +
        'OK = remplacer par ' + fmt(mm) + ' mm\n' +
        'Annuler = additionner (total ' + fmt(existant.mm + mm) + ' mm)'
      );
      existant.mm  = remplacer ? mm : existant.mm + mm;
      existant.n   = note ? (existant.n && !remplacer ? existant.n + ' / ' + note : note) : (remplacer ? '' : existant.n);
      existant.maj = new Date().toISOString();
      eclair(remplacer ? 'Relevé remplacé' : 'Relevé additionné');
    } else if (existant) {
      existant.mm = mm; existant.n = note; existant.supp = false;
      existant.maj = new Date().toISOString();
      eclair(fmt(mm) + ' mm au ' + dateFR(d));
    } else {
      releves.push({d: d, mm: mm, n: note, maj: new Date().toISOString(), supp: false});
      eclair(fmt(mm) + ' mm au ' + dateFR(d));
    }

    trier(); sauver(); viderSaisie(); apresModif();
  }

  function jourSec() {
    const d = $('fDate').value || aujIso();
    $('fMm').value = '0';
    $('fDate').value = d;
    enregistrer();
  }

  function ajoutRapide(n, raz) {
    const champ = $('fMm');
    if (raz) { champ.value = ''; champ.focus(); return; }
    const actuel = parseFloat(String(champ.value).replace(',', '.')) || 0;
    champ.value = fmtCourt(Math.round((actuel + n) * 10) / 10);
  }

  function viderSaisie() {
    $('fMm').value = '';
    $('fNote').value = '';
    $('fDate').value = aujIso();
  }

  function modifier(d) {
    const e = trouver(d);
    $('fDate').value = d;
    $('fMm').value   = e && !e.supp ? fmtCourt(e.mm) : '';
    $('fNote').value = e && !e.supp ? (e.n || '') : '';
    onglet('saisie');
    window.scrollTo({top: 0, behavior: 'smooth'});
    $('fMm').focus();
    if (e && !e.supp) eclair('Corrige puis enregistre (choisis « remplacer »)');
  }

  function supprimer(d) {
    if (!confirm('Supprimer le relevé du ' + dateFR(d) + ' ?')) return;
    const e = trouver(d);
    if (e) { e.supp = true; e.maj = new Date().toISOString(); }
    sauver(); apresModif();
    eclair('Relevé supprimé');
  }

  /* ===================== Calendrier ===================== */

  function calMois(pas) {
    calRef = new Date(calRef.getFullYear(), calRef.getMonth() + pas, 1);
    rendreCalendrier();
  }

  function rendreCalendrier() {
    const a = calRef.getFullYear(), m = calRef.getMonth();
    $('calTitre').textContent = MOIS[m] + ' ' + a;

    const premier  = new Date(a, m, 1);
    const nbJours  = new Date(a, m + 1, 0).getDate();
    const decalage = (premier.getDay() + 6) % 7;      /* la semaine commence lundi */
    const auj      = aujIso();

    let html = JSEM.map(function (j) { return '<div class="cal-jsem">' + j + '</div>'; }).join('');
    for (let i = 0; i < decalage; i++) html += '<div class="cal-case vide"></div>';

    for (let j = 1; j <= nbJours; j++) {
      const d = a + '-' + String(m + 1).padStart(2, '0') + '-' + String(j).padStart(2, '0');
      const e = trouver(d);
      const a_mm = e && !e.supp;
      const cl = [];
      if (a_mm) cl.push('d-' + classe(e.mm).css);
      if (d === auj) cl.push('auj');
      if (d > auj) cl.push('futur');
      html += '<button class="cal-case ' + cl.join(' ') + '"' +
              (d > auj ? ' disabled' : ' onclick="App.modifier(\'' + d + '\')"') + '>' +
              '<span class="n">' + j + '</span>' +
              (a_mm && e.mm > 0 ? '<span class="mm">' + fmtCourt(e.mm) + '</span>' : '') +
              '</button>';
    }
    $('calGrille').innerHTML = html;

    const s = statsMois(a, m);
    $('calJours').textContent = s.jours;
    $('calTotal').textContent = fmt(s.cumul) + ' mm';
    $('calCumul').textContent = fmt(s.cumul) + ' mm';
  }

  /* ===================== Bilans ===================== */

  function rendreBilans() {
    const anCourante = new Date().getFullYear();
    const defs = [
      ['7 jours',        periode(7),    false],
      ['15 jours',       periode(15),   false],
      ['30 jours',       periode(30),   false],
      ['2 mois (60 j)',  periode(60),   false],
      ['3 mois (90 j)',  periode(90),   false],
      ['12 mois',        periode(365),  false],
      ['Année ' + anCourante, statsAnnee(anCourante), true],
      ['Depuis le début', stats(actifs()), false]
    ];

    $('cartesBilan').innerHTML = defs.map(function (x) {
      const t = x[0], s = x[1], pleine = x[2];
      return '<div class="carte' + (pleine ? ' pleine' : '') + '">' +
        '<div class="t">' + t + '</div>' +
        '<div class="v">' + fmt(s.cumul) + ' <small>mm</small></div>' +
        '<div class="d">' + s.jours + ' jour' + (s.jours > 1 ? 's' : '') + ' de pluie' +
        (s.max ? '<br>max ' + fmt(s.max.mm) + ' mm le ' + dateCourte(s.max.d) : '') +
        '</div></div>';
    }).join('');

    $('legende').innerHTML = NOMS.map(function (n, i) {
      return '<span class="etiq e-' + CSS[i] + '">' + n + ' · ' + bornes(i) + '</span>';
    }).join('');

    /* Sélecteur d'année */
    const an = anneesConnues();
    const sel = $('selAnnee'), garde = sel.value;
    sel.innerHTML = an.map(function (x) { return '<option>' + x + '</option>'; }).join('');
    sel.value = an.includes(garde) ? garde : an[0];
    const annee = sel.value;

    /* Graphique mensuel */
    const parMois = MOIS.map(function (_, i) { return statsMois(annee, i); });
    const maxM = Math.max.apply(null, parMois.map(function (s) { return s.cumul; }).concat([1]));

    $('graph').innerHTML = parMois.map(function (s) {
      const h = s.cumul ? Math.max(2, (s.cumul / maxM) * 100) : 0;
      return '<div class="g-col">' +
        (s.cumul ? '<div class="g-val">' + Math.round(s.cumul) + '</div>' : '') +
        '<div class="g-barre' + (s.cumul >= maxM * 0.72 ? ' fort' : '') + '" style="height:' + h + '%"></div></div>';
    }).join('');
    $('graphLabels').innerHTML = MOIS_C.map(function (m) { return '<div>' + m + '</div>'; }).join('');

    const totAn = parMois.reduce(function (s, m) { return s + m.cumul; }, 0);
    const jrAn  = parMois.reduce(function (s, m) { return s + m.jours; }, 0);
    $('tblMois').innerHTML = parMois.map(function (s, i) {
      return '<tr' + (s.cumul ? '' : ' class="gris"') + '><td>' + MOIS_3[i] + '</td>' +
        '<td class="num">' + fmt(s.cumul) + '</td>' +
        '<td class="num">' + s.jours + '</td>' +
        '<td class="num">' + (s.max ? fmt(s.max.mm) : '—') + '</td></tr>';
    }).join('') +
      '<tr class="total"><td>' + annee + '</td><td class="num">' + fmt(totAn) +
      '</td><td class="num">' + jrAn + '</td><td class="num"></td></tr>';

    $('tblAnnees').innerHTML = an.map(function (x) {
      const s = statsAnnee(x);
      return '<tr><td><strong>' + x + '</strong></td>' +
        '<td class="num">' + fmt(s.cumul) + ' mm</td>' +
        '<td class="num">' + s.jours + '</td>' +
        '<td class="num">' + (s.max ? fmt(s.max.mm) : '—') + '</td></tr>';
    }).join('');
  }

  /* ===================== Historique ===================== */

  function rendreHistorique() {
    const an = anneesConnues();

    const fa = $('filtreAnnee'), gardeA = fa.dataset.init ? fa.value : String(new Date().getFullYear());
    fa.dataset.init = '1';
    fa.innerHTML = '<option value="">Toutes les années</option>' +
      an.map(function (x) { return '<option>' + x + '</option>'; }).join('');
    fa.value = an.includes(gardeA) ? gardeA : '';

    const fc = $('filtreClasse'), gardeC = fc.value;
    fc.innerHTML = '<option value="">Toutes classes</option>' +
      NOMS.map(function (n, i) { return '<option value="' + i + '">' + n + '</option>'; }).join('');
    fc.value = gardeC;

    const liste = actifs().filter(function (e) {
      return (!fa.value || e.d.slice(0, 4) === fa.value) &&
             (fc.value === '' || indexClasse(e.mm) === parseInt(fc.value, 10));
    });

    $('cptHisto').textContent = liste.length + ' · ' +
      fmt(liste.reduce(function (s, e) { return s + e.mm; }, 0)) + ' mm';

    if (!liste.length) {
      $('histo').innerHTML = '<div class="vide">Aucun relevé à afficher</div>';
      return;
    }

    let html = '', moisCourant = '';
    liste.forEach(function (e) {
      const cle = e.d.slice(0, 7);
      if (cle !== moisCourant) {
        moisCourant = cle;
        const s = stats(liste.filter(function (x) { return x.d.slice(0, 7) === cle; }));
        html += '<div class="bandeau-mois"><span>' + MOIS[parseInt(cle.slice(5, 7), 10) - 1] +
                ' ' + cle.slice(0, 4) + '</span><span>' + fmt(s.cumul) + ' mm</span></div>';
      }
      const c = classe(e.mm);
      html += '<div class="jour">' +
        '<span class="date">' + dateCourte(e.d) + '</span>' +
        '<span class="val">' + fmt(e.mm) + '</span>' +
        '<span class="milieu"><span class="etiq e-' + c.css + '">' + c.nom + '</span>' +
        (e.n ? '<div class="note">' + echap(e.n) + '</div>' : '') + '</span>' +
        '<span class="actions">' +
          '<button class="ico" title="Modifier" onclick="App.modifier(\'' + e.d + '\')">✎</button>' +
          '<button class="ico sup" title="Supprimer" onclick="App.supprimer(\'' + e.d + '\')">✕</button>' +
        '</span></div>';
    });
    $('histo').innerHTML = html;
  }

  /* ===================== Réglages ===================== */

  function rendreReglages() {
    const c = GH.lireConfig();
    if (!$('gOwner').matches(':focus'))   $('gOwner').value   = c.owner;
    if (!$('gRepo').matches(':focus'))    $('gRepo').value    = c.repo;
    if (!$('gBranche').matches(':focus')) $('gBranche').value = c.branche;
    if (!$('gChemin').matches(':focus'))  $('gChemin').value  = c.chemin;
    if (!$('gJeton').matches(':focus') && c.jeton) $('gJeton').value = c.jeton;

    let resume;
    if (!GH.estConfigure()) {
      resume = 'Non configuré : les relevés ne sont que sur cet appareil. Remplis les champs ci-dessous pour les envoyer sur GitHub.';
    } else {
      resume = 'Cible : <strong>' + echap(c.owner + '/' + c.repo) + '</strong> · branche ' +
               echap(c.branche) + ' · ' + echap(c.chemin) + '<br>' +
               (etat.derniereSync
                 ? 'Dernière synchronisation : ' + new Date(etat.derniereSync).toLocaleString('fr-FR')
                 : 'Jamais synchronisé') +
               (etat.enAttente ? '<br><strong>Modifications en attente d\'envoi.</strong>' : '');
    }
    $('resumeSync').innerHTML = resume;

    $('seuils').innerHTML = [1, 2, 3, 4].map(function (i) {
      return '<span><span class="etiq e-' + CSS[i] + '">' + NOMS[i] + '</span></span>' +
             '<span style="color:var(--gris);font-size:12px">jusqu\'à</span>' +
             '<input type="text" inputmode="decimal" id="seuil' + i + '" value="' + fmtCourt(seuils[i - 1]) + '" style="width:88px">';
    }).join('');

    const n = actifs().length;
    $('infoLocal').innerHTML =
      n + ' relevé' + (n > 1 ? 's' : '') + ' enregistré' + (n > 1 ? 's' : '') + ' sur cet appareil.' +
      (releves.length > n ? '<br>' + (releves.length - n) + ' ligne(s) supprimée(s) conservée(s) pour la synchronisation.' : '');
    $('versionApp').textContent = VERSION;
  }

  function enregistrerConfig() {
    GH.enregistrerConfig({
      owner:   $('gOwner').value,
      repo:    $('gRepo').value,
      branche: $('gBranche').value,
      chemin:  $('gChemin').value,
      jeton:   $('gJeton').value
    });
    eclair('Réglages enregistrés');
    rendreReglages();
    majEtatSync();
    if (GH.estConfigure()) synchroniser(true);
  }

  async function testerConnexion() {
    try {
      majPastille('attente', 'Test…');
      const r = await GH.tester();
      eclair('Connexion établie : ' + r.nom + (r.prive ? ' (privé)' : ' (public)'));
      majEtatSync();
    } catch (e) {
      eclair(e.message, true);
      majPastille('erreur', 'Erreur');
    }
  }

  function enregistrerSeuils() {
    const v = [1, 2, 3, 4].map(function (i) {
      return parseFloat(String($('seuil' + i).value).replace(',', '.'));
    });
    if (v.some(function (x) { return isNaN(x) || x <= 0; })) { eclair('Seuils non valides', true); return; }
    for (let i = 1; i < 4; i++) {
      if (v[i] <= v[i - 1]) { eclair('Chaque seuil doit être plus grand que le précédent', true); return; }
    }
    seuils = v;
    localStorage.setItem(CLE_SEUI, JSON.stringify(seuils));
    eclair('Seuils appliqués');
    rendre();
  }

  function seuilsDefaut() {
    seuils = SEUILS_DEFAUT.slice();
    localStorage.setItem(CLE_SEUI, JSON.stringify(seuils));
    eclair('Seuils d\'origine rétablis');
    rendre();
  }

  function viderLocal() {
    if (!confirm('Effacer tous les relevés de cet appareil ?\n\nCette action est sans retour sur ce téléphone.')) return;
    if (!confirm('Confirmer une dernière fois : effacer ' + actifs().length + ' relevé(s) local(aux) ?')) return;
    releves = [];
    localStorage.removeItem(CLE_DATA);
    rendre();
    eclair('Données locales effacées');
  }

  /* ===================== Export / import ===================== */

  function telecharger(nom, contenu, type) {
    const b = new Blob([contenu], {type: type});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  function exportCSV() {
    const l = actifs();
    if (!l.length) { eclair('Rien à exporter', true); return; }
    const lignes = ['Date;Hauteur (mm);Classification;Note'];
    l.slice().reverse().forEach(function (e) {
      lignes.push(dateFR(e.d) + ';' + fmt(e.mm) + ';' + classe(e.mm).nom +
                  ';"' + String(e.n || '').replace(/"/g, '""') + '"');
    });
    telecharger('optipluie_' + aujIso() + '.csv', '﻿' + lignes.join('\r\n'), 'text/csv;charset=utf-8');
    eclair('Export CSV généré');
  }

  function exportJSON() {
    telecharger('optipluie_sauvegarde_' + aujIso() + '.json',
      JSON.stringify({version: 1, appli: 'OptiPluie', maj: new Date().toISOString(), releves: releves}, null, 1),
      'application/json');
    eclair('Sauvegarde générée');
  }

  function importJSON(ev) {
    const f = ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = function () {
      try {
        const brut = JSON.parse(r.result);
        const liste = Array.isArray(brut) ? brut : (brut.releves || []);
        if (!Array.isArray(liste) || !liste.length) throw new Error('vide');
        if (!confirm('Importer ' + liste.length + ' relevé(s) ?\n\nIls seront fusionnés avec les tiens : pour une même date, la version la plus récente est conservée.')) return;
        liste.forEach(function (e) { if (e && e.d && !e.maj) e.maj = '1970-01-01T00:00:00.000Z'; });
        releves = GH.fusionner(releves, liste);
        sauver(); apresModif();
        eclair('Import terminé');
      } catch (e) {
        eclair('Fichier non valide', true);
      }
      ev.target.value = '';
    };
    r.readAsText(f);
  }

  /* ===================== Synchronisation ===================== */

  function majPastille(classeNom, texte) {
    $('pastille').className = 'pastille ' + (classeNom || '');
    $('texteSync').textContent = texte;
    $('pastilleOnglet').classList.toggle('on', classeNom === 'erreur' || etat.enAttente);
  }

  function majEtatSync() {
    if (!GH.estConfigure())    { majPastille('', 'Local');        return; }
    if (!navigator.onLine)     { majPastille('horsligne', 'Hors réseau'); return; }
    if (etat.enAttente)        { majPastille('attente', 'À envoyer'); return; }
    majPastille('ok', 'À jour');
  }

  function planifierSync() {
    if (!GH.estConfigure()) return;
    etat.enAttente = true; sauverEtat(); majEtatSync();
    clearTimeout(minuteur);
    minuteur = setTimeout(function () { synchroniser(false); }, 1500);
  }

  let enCours = false;

  async function synchroniser(manuel) {
    if (!GH.estConfigure()) {
      if (manuel) eclair('Renseigne d\'abord le dépôt GitHub', true);
      majEtatSync();
      return;
    }
    if (!navigator.onLine) {
      if (manuel) eclair('Pas de réseau : l\'envoi se fera au retour de la connexion', true);
      majEtatSync();
      return;
    }
    if (enCours) return;
    enCours = true;
    majPastille('attente', 'Sync…');

    try {
      const distant = await GH.lire();
      const fusion  = GH.fusionner(releves, distant.releves);

      const localChange = !GH.identiques(fusion, releves);
      if (localChange) { releves = fusion; sauver(); rendre(); }
      else { releves = fusion; }

      if (!distant.existe || !GH.identiques(fusion, distant.releves)) {
        await GH.ecrire(fusion, 'OptiPluie — ' + actifs().length + ' relevés au ' +
                                new Date().toLocaleDateString('fr-FR'));
      }

      etat.enAttente = false;
      etat.derniereSync = new Date().toISOString();
      sauverEtat();
      majEtatSync();
      if (manuel) eclair('Synchronisation terminée');
      if ($('vue-reglages').classList.contains('active')) rendreReglages();

    } catch (e) {
      etat.enAttente = true; sauverEtat();
      majPastille('erreur', 'Erreur');
      if (manuel) eclair(e.message, true);
    } finally {
      enCours = false;
    }
  }

  /* ===================== Rendu global ===================== */

  function rendre() {
    rendreCalendrier();
    rendreBilans();
    rendreHistorique();
    rendreReglages();
    majEtatSync();
  }

  function apresModif() {
    rendre();
    planifierSync();
  }

  function onglet(nom) {
    document.querySelectorAll('.vue').forEach(function (v) { v.classList.remove('active'); });
    $('vue-' + nom).classList.add('active');
    document.querySelectorAll('.onglet').forEach(function (b) {
      b.classList.toggle('actif', b.dataset.vue === nom);
    });
    window.scrollTo(0, 0);
  }

  function allerReglages() { onglet('reglages'); }

  /* ===================== Démarrage ===================== */

  function demarrer() {
    GH.chargerConfig();
    charger();
    $('fDate').value = aujIso();
    calRef = new Date();
    rendre();

    /* Clavier francais : la virgule doit passer, d'ou un champ texte filtre */
    $('fMm').addEventListener('input', function () {
      let p = this.value.replace(/[^0-9.,]/g, '').replace(/\./g, ',');
      const i = p.indexOf(',');
      if (i !== -1) p = p.slice(0, i + 1) + p.slice(i + 1).replace(/,/g, '');
      if (p !== this.value) this.value = p;
    });

    $('fMm').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); enregistrer(); }
    });
    $('fNote').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); enregistrer(); }
    });

    window.addEventListener('online',  function () { majEtatSync(); synchroniser(false); });
    window.addEventListener('offline', majEtatSync);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      const vieux = !etat.derniereSync ||
                    (Date.now() - new Date(etat.derniereSync).getTime() > 120000);
      if (etat.enAttente || vieux) synchroniser(false);
    });

    if (GH.estConfigure()) synchroniser(false);

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* pas bloquant */ });
      });
    }
  }

  return {
    demarrer: demarrer,
    onglet: onglet,
    allerReglages: allerReglages,
    rendre: rendre,
    enregistrer: enregistrer,
    jourSec: jourSec,
    ajoutRapide: ajoutRapide,
    modifier: modifier,
    supprimer: supprimer,
    calMois: calMois,
    enregistrerConfig: enregistrerConfig,
    testerConnexion: testerConnexion,
    synchroniser: synchroniser,
    enregistrerSeuils: enregistrerSeuils,
    seuilsDefaut: seuilsDefaut,
    viderLocal: viderLocal,
    exportCSV: exportCSV,
    exportJSON: exportJSON,
    importJSON: importJSON
  };

})();

document.addEventListener('DOMContentLoaded', App.demarrer);
