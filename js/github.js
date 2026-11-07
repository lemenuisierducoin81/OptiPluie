/* ===========================================================
   OptiPluie — js/github.js
   Lecture / écriture du fichier de relevés dans un dépôt GitHub.

   Le fichier distant a cette forme :
   {
     "version": 1,
     "maj": "2026-11-07T08:00:00.000Z",
     "releves": [ { "d":"2026-11-07", "mm":12.4, "n":"note",
                    "maj":"2026-11-07T08:00:00.000Z", "supp":false } ]
   }
   Chaque relevé porte sa date de dernière modification : c'est elle qui
   départage téléphone et ordinateur quand les deux ont touché la même date.
   Une suppression n'efface pas la ligne, elle la marque supp:true, sinon la
   ligne supprimée sur un appareil reviendrait depuis l'autre.
   =========================================================== */

const GH = (function () {

  const CLE_CONFIG = 'optipluie_config_github';
  const API = 'https://api.github.com';

  let config = {owner: '', repo: '', branche: 'main', chemin: 'data/releves.json', jeton: ''};
  let sha = null;   // empreinte de la version distante connue

  /* ---------- Configuration ---------- */

  function chargerConfig() {
    try {
      const c = JSON.parse(localStorage.getItem(CLE_CONFIG));
      if (c) config = Object.assign(config, c);
    } catch (e) { /* configuration illisible : on garde les valeurs par défaut */ }
    return config;
  }

  function enregistrerConfig(c) {
    config = Object.assign(config, c);
    config.branche = (config.branche || 'main').trim();
    config.chemin  = (config.chemin  || 'data/releves.json').trim().replace(/^\/+/, '');
    config.owner   = (config.owner   || '').trim();
    config.repo    = (config.repo    || '').trim();
    config.jeton   = (config.jeton   || '').trim();
    localStorage.setItem(CLE_CONFIG, JSON.stringify(config));
    sha = null;      // la cible a pu changer
    return config;
  }

  function lireConfig() { return Object.assign({}, config); }

  function estConfigure() {
    return !!(config.owner && config.repo && config.jeton);
  }

  /* ---------- Encodage base64 compatible accents ---------- */

  function versB64(texte) {
    const octets = new TextEncoder().encode(texte);
    let bin = '';
    for (let i = 0; i < octets.length; i++) bin += String.fromCharCode(octets[i]);
    return btoa(bin);
  }

  function depuisB64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const octets = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(octets);
  }

  /* ---------- Appel de l'API ---------- */

  function url() {
    return API + '/repos/' + encodeURIComponent(config.owner) + '/' +
           encodeURIComponent(config.repo) + '/contents/' +
           config.chemin.split('/').map(encodeURIComponent).join('/');
  }

  async function appel(methode, suffixe, corps) {
    const rep = await fetch(url() + (suffixe || ''), {
      method: methode,
      headers: {
        'Authorization': 'Bearer ' + config.jeton,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: corps ? JSON.stringify(corps) : undefined,
      cache: 'no-store'
    });
    return rep;
  }

  function messageErreur(rep, detail) {
    if (rep.status === 401) return "Jeton refusé : vérifie qu'il est bien collé et non expiré.";
    if (rep.status === 403) return "Accès refusé : le jeton n'a pas le droit d'écrire sur ce dépôt (ou limite d'appels atteinte).";
    if (rep.status === 404) return "Dépôt, branche ou chemin introuvable : vérifie le compte, le nom du dépôt et la branche.";
    if (rep.status === 409) return "Le fichier a changé entre-temps.";
    if (rep.status === 422) return "GitHub a refusé l'écriture : " + (detail || 'requête invalide') + ".";
    return 'Erreur GitHub ' + rep.status + (detail ? ' — ' + detail : '');
  }

  /* ---------- Lecture ---------- */
  /* Renvoie {releves:[...], existe:bool}. Un fichier absent n'est pas une
     erreur : c'est simplement la toute première utilisation.               */

  async function lire() {
    if (!estConfigure()) throw new Error('Synchronisation non configurée.');

    const rep = await appel('GET', '?ref=' + encodeURIComponent(config.branche) + '&t=' + Date.now());

    if (rep.status === 404) { sha = null; return {releves: [], existe: false}; }
    if (!rep.ok) {
      let d = '';
      try { d = (await rep.json()).message || ''; } catch (e) {}
      throw new Error(messageErreur(rep, d));
    }

    const json = await rep.json();
    sha = json.sha;

    let contenu;
    try {
      contenu = JSON.parse(depuisB64(json.content || ''));
    } catch (e) {
      throw new Error('Le fichier du dépôt est illisible (JSON invalide). Rien n\'a été modifié.');
    }

    const releves = Array.isArray(contenu) ? contenu : (contenu.releves || []);
    return {releves: releves, existe: true};
  }

  /* ---------- Écriture ---------- */

  async function ecrire(releves, message) {
    if (!estConfigure()) throw new Error('Synchronisation non configurée.');

    const contenu = JSON.stringify({
      version: 1,
      appli: 'OptiPluie',
      maj: new Date().toISOString(),
      releves: releves
    }, null, 1);

    const corps = {
      message: message || ('OptiPluie — relevés au ' + new Date().toLocaleString('fr-FR')),
      content: versB64(contenu),
      branch: config.branche
    };
    if (sha) corps.sha = sha;

    let rep = await appel('PUT', '', corps);

    /* 409 / 422 : quelqu'un a écrit entre-temps. On relit l'empreinte et on
       refait une seule tentative — la fusion a déjà eu lieu côté appli.     */
    if (rep.status === 409 || rep.status === 422) {
      try {
        const r2 = await appel('GET', '?ref=' + encodeURIComponent(config.branche) + '&t=' + Date.now());
        if (r2.ok) { sha = (await r2.json()).sha; corps.sha = sha; }
        else if (r2.status === 404) { sha = null; delete corps.sha; }
      } catch (e) { /* on retente quand même */ }
      rep = await appel('PUT', '', corps);
    }

    if (!rep.ok) {
      let d = '';
      try { d = (await rep.json()).message || ''; } catch (e) {}
      throw new Error(messageErreur(rep, d));
    }

    const json = await rep.json();
    sha = json.content && json.content.sha ? json.content.sha : sha;
    return true;
  }

  /* ---------- Test de connexion ---------- */

  async function tester() {
    if (!estConfigure()) throw new Error('Renseigne le compte, le dépôt et le jeton.');
    const r = await fetch(API + '/repos/' + encodeURIComponent(config.owner) + '/' +
                          encodeURIComponent(config.repo), {
      headers: {
        'Authorization': 'Bearer ' + config.jeton,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'no-store'
    });
    if (!r.ok) {
      let d = '';
      try { d = (await r.json()).message || ''; } catch (e) {}
      throw new Error(messageErreur(r, d));
    }
    const depot = await r.json();
    if (depot.permissions && depot.permissions.push === false) {
      throw new Error('Dépôt accessible, mais le jeton ne peut pas y écrire (droit « Contents » en lecture seule).');
    }
    return {prive: depot.private, branche: depot.default_branch, nom: depot.full_name};
  }

  /* ---------- Fusion de deux listes de relevés ---------- */
  /* Pour une même date, la version modifiée le plus récemment l'emporte.
     Une ligne sans date de modification est considérée comme la plus
     ancienne, pour ne jamais écraser une correction récente.               */

  function fusionner(listeA, listeB) {
    const par = new Map();
    const avaler = function (liste) {
      (liste || []).forEach(function (e) {
        if (!e || !e.d) return;
        const propre = {
          d:    e.d,
          mm:   typeof e.mm === 'number' ? e.mm : parseFloat(e.mm) || 0,
          n:    e.n || '',
          maj:  e.maj || '',
          supp: !!e.supp
        };
        const vieux = par.get(propre.d);
        if (!vieux || (propre.maj || '') >= (vieux.maj || '')) par.set(propre.d, propre);
      });
    };
    avaler(listeA);
    avaler(listeB);
    return Array.from(par.values()).sort(function (a, b) { return a.d < b.d ? 1 : -1; });
  }

  /* ---------- Les deux listes sont-elles identiques ? ---------- */

  function identiques(a, b) {
    const cle = function (l) {
      return (l || []).map(function (e) {
        return e.d + '|' + e.mm + '|' + (e.n || '') + '|' + (e.supp ? 1 : 0);
      }).sort().join('~');
    };
    return cle(a) === cle(b);
  }

  return {
    chargerConfig: chargerConfig,
    enregistrerConfig: enregistrerConfig,
    lireConfig: lireConfig,
    estConfigure: estConfigure,
    lire: lire,
    ecrire: ecrire,
    tester: tester,
    fusionner: fusionner,
    identiques: identiques
  };

})();
