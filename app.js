"use strict";

const RH = "M60 100 L160 50 L260 100 L160 150 Z";
    const TOOLS = {
      select: {
        name: "Sélectionner", en: "Select", key: "Espace", cat: "principal", anim: "a-select",
        def: "L’outil de base : il choisit les arêtes, faces, groupes et composants sur lesquels les autres outils vont agir.",
        how: [
          "Un clic sélectionne un élément ; un double-clic, une face et ses arêtes ; un triple-clic, tout l’objet connecté.",
          "Glissez de gauche à droite pour une sélection « fenêtre » (objets entièrement inclus), de droite à gauche pour une sélection « capture » (objets touchés).",
          "Maintenez Ctrl pour ajouter, Maj pour ajouter ou retirer, Ctrl+Maj pour retirer de la sélection."
        ],
        tip: "appuyez sur Espace à tout moment pour revenir à Sélectionner : c’est le raccourci le plus utilisé de SketchUp."
      },
      eraser: {
        name: "Gomme", en: "Eraser", key: "E", cat: "principal", anim: "a-erase",
        def: "Supprime des arêtes, et avec elles les faces qu’elles délimitaient. Elle sert aussi à masquer ou adoucir des lignes.",
        how: [
          "Cliquez sur une arête pour l’effacer.",
          "Maintenez le clic et glissez sur plusieurs arêtes : elles sont surlignées, puis effacées au relâchement.",
          "Maintenez Maj pour masquer une arête, Ctrl pour l’adoucir et obtenir une surface lisse."
        ],
        tip: "pour supprimer une face en gardant ses arêtes, sélectionnez-la et appuyez sur Suppr."
      },
      paint: {
        name: "Colorier", en: "Paint Bucket", key: "B", cat: "principal", anim: "a-paint",
        def: "Applique des couleurs et des matières (bois, brique, verre…) sur les faces, les groupes et les composants.",
        how: [
          "Choisissez une matière dans le panneau Matières (Fenêtre › Matières).",
          "Cliquez sur une face pour la peindre.",
          "Maintenez Alt (Cmd sur Mac) pour prélever une matière déjà présente dans le modèle."
        ],
        tip: "Ctrl peint toutes les faces connectées de même matière ; Maj remplace cette matière partout dans le modèle."
      },
      line: {
        name: "Ligne", en: "Line", key: "L", cat: "dessin",
        path: "M70 150 L160 45 L250 150 Z", len: 458, face: true,
        def: "Trace des arêtes droites. C’est la brique de base : quand des lignes forment une boucle fermée et plane, SketchUp crée une face.",
        how: [
          "Cliquez pour poser le point de départ.",
          "Déplacez la souris et cliquez pour terminer le segment ; la ligne suivante part de ce point.",
          "Tapez une longueur, par exemple 2,5m, puis Entrée pour une valeur exacte."
        ],
        tip: "les flèches du clavier verrouillent un axe : → rouge, ← vert, ↑ bleu."
      },
      rect: {
        name: "Rectangle", en: "Rectangle", key: "R", cat: "dessin",
        path: RH, len: 448, face: true,
        def: "Dessine un rectangle et sa face en deux clics, aligné sur les axes.",
        how: [
          "Cliquez pour poser le premier coin.",
          "Déplacez la souris vers le coin opposé et cliquez.",
          "Ou tapez les dimensions, par exemple 4m;3m, puis Entrée."
        ],
        tip: "quand le rectangle devient un carré ou un rectangle d’or, SketchUp l’indique par une diagonale pointillée."
      },
      circle: {
        name: "Cercle", en: "Circle", key: "C", cat: "dessin",
        path: "M60 100 A100 50 0 1 1 260 100 A100 50 0 1 1 60 100 Z", len: 486, face: true,
        def: "Dessine un cercle à partir de son centre. En réalité, c’est un polygone de 24 côtés par défaut.",
        how: [
          "Cliquez pour placer le centre.",
          "Éloignez la souris pour définir le rayon, puis cliquez.",
          "Tapez un rayon, par exemple 0,5m, puis Entrée pour une taille précise."
        ],
        tip: "avant de cliquer, tapez un nombre de côtés (par exemple 48) puis Entrée pour un cercle plus lisse."
      },
      arc: {
        name: "Arc", en: "2 Point Arc", key: "A", cat: "dessin",
        path: "M60 145 Q160 15 260 145", len: 248, face: false,
        def: "Dessine des courbes. L’arc 2 points est l’outil d’arc par défaut de SketchUp 2016.",
        how: [
          "Cliquez pour le point de départ de l’arc.",
          "Cliquez pour le point d’arrivée.",
          "Déplacez la souris pour régler le renflement, puis cliquez."
        ],
        tip: "juste après le tracé, tapez une nouvelle valeur de renflement puis Entrée pour ajuster la courbe."
      },
      pushpull: {
        name: "Pousser/Tirer", en: "Push/Pull", key: "P", cat: "modif", anim: "a-push",
        def: "L’outil signature de SketchUp : il extrude une face plane pour créer un volume, ou la creuse pour faire un renfoncement.",
        how: [
          "Survolez une face : elle se couvre de points.",
          "Cliquez, déplacez la souris pour tirer ou pousser, puis cliquez.",
          "Tapez une distance, par exemple 2,7m, puis Entrée pour une hauteur exacte."
        ],
        tip: "un double-clic sur une autre face répète la même distance. Ctrl crée une nouvelle face au lieu de déplacer l’existante."
      },
      move: {
        name: "Déplacer", en: "Move", key: "M", cat: "modif", anim: "a-move",
        def: "Déplace, copie ou étire la géométrie sélectionnée.",
        how: [
          "Sélectionnez les éléments puis activez l’outil.",
          "Cliquez un point de départ (un coin, par exemple), puis cliquez la destination.",
          "Maintenez Ctrl (Option sur Mac) pour déplacer une copie."
        ],
        tip: "juste après une copie, tapez x5 pour 5 copies alignées, ou /5 pour les répartir entre deux points."
      },
      rotate: {
        name: "Faire pivoter", en: "Rotate", key: "Q", cat: "modif", anim: "a-rotate",
        def: "Fait tourner des éléments autour d’un point, avec un rapporteur pour des angles précis.",
        how: [
          "Sélectionnez puis activez l’outil : un rapporteur apparaît.",
          "Cliquez le centre de rotation, puis un point de référence.",
          "Tournez et cliquez, ou tapez un angle (90) puis Entrée."
        ],
        tip: "avec Ctrl, vous faites une copie en rotation ; tapez ensuite x6 pour une série circulaire."
      },
      scale: {
        name: "Échelle", en: "Scale", key: "S", cat: "modif", anim: "a-scale",
        def: "Agrandit, réduit ou étire la sélection à l’aide de poignées vertes.",
        how: [
          "Sélectionnez puis activez l’outil : des poignées entourent l’objet.",
          "Tirez une poignée de coin pour une mise à l’échelle proportionnelle.",
          "Tapez un facteur (2 pour doubler) puis Entrée."
        ],
        tip: "Ctrl met à l’échelle depuis le centre ; Maj bascule entre proportionnel et libre."
      },
      offset: {
        name: "Décaler", en: "Offset", key: "F", cat: "modif",
        base: "M40 100 L160 40 L280 100 L160 160 Z", path: "M90 100 L160 65 L230 100 L160 135 Z", len: 314, face: true,
        def: "Crée une copie parallèle des arêtes d’une face, vers l’intérieur ou vers l’extérieur.",
        how: [
          "Cliquez sur une face (ou sur des arêtes sélectionnées).",
          "Déplacez la souris vers l’intérieur ou l’extérieur, puis cliquez.",
          "Tapez une distance, par exemple 0,2m, puis Entrée."
        ],
        tip: "parfait pour l’épaisseur des murs, les cadres de fenêtres ou la margelle d’une piscine."
      },
      follow: {
        name: "Suivez-moi", en: "Follow Me", key: "", cat: "modif", anim: "a-push",
        def: "Extrude un profil le long d’un chemin : moulures, corniches, tuyaux, rampes…",
        how: [
          "Dessinez un chemin (des arêtes) et, à son extrémité, un profil perpendiculaire (une face).",
          "Sélectionnez le chemin, puis activez Suivez-moi (Outils › Suivez-moi).",
          "Cliquez sur le profil : il est extrudé tout le long du chemin."
        ],
        tip: "pour une sphère, faites suivre à un cercle vertical le contour d’un cercle horizontal de même centre."
      },
      tape: {
        name: "Mètre", en: "Tape Measure", key: "T", cat: "construction",
        base: RH, path: "M60 100 L160 150", len: 112, face: false, label: "5,00 m", lx: 64, ly: 150,
        def: "Mesure des distances et crée des lignes de construction (guides) pour dessiner avec précision.",
        how: [
          "Cliquez un point de départ, puis un point d’arrivée : la distance s’affiche.",
          "Cliquez sur une arête puis éloignez-vous pour créer un guide parallèle.",
          "Tapez une distance puis Entrée pour placer le guide exactement."
        ],
        tip: "mesurez une arête puis tapez sa vraie longueur : SketchUp propose de redimensionner tout le modèle."
      },
      dim: {
        name: "Cotation", en: "Dimension", key: "", cat: "construction",
        base: RH, path: "M160 172 L260 122", len: 112, face: false, label: "10,00 m", lx: 226, ly: 170,
        def: "Ajoute des cotes liées au modèle, qui se mettent à jour quand la géométrie change.",
        how: [
          "Activez l’outil (Outils › Cotation) et cliquez le point de départ.",
          "Cliquez le point d’arrivée.",
          "Éloignez la souris pour positionner la cote, puis cliquez."
        ],
        tip: "réglez la police, les unités et les flèches dans Fenêtre › Infos sur le modèle › Cotations."
      },
      section: {
        name: "Plan de section", en: "Section Plane", key: "", cat: "construction", anim: "a-section",
        def: "Coupe virtuellement le modèle pour révéler l’intérieur : idéal pour les coupes et les plans d’architecture.",
        how: [
          "Activez l’outil depuis Outils › Plan de section.",
          "Posez le plan sur une face : il s’aligne sur elle.",
          "Déplacez-le avec Déplacer (M) pour faire avancer la coupe."
        ],
        tip: "clic droit sur le plan › Activer la coupe. Chaque scène peut mémoriser sa propre coupe."
      },
      orbit: {
        name: "Orbite", en: "Orbit", key: "O", cat: "camera", anim: "a-orbit",
        def: "Fait tourner la caméra autour du modèle pour le voir sous tous les angles.",
        how: [
          "Activez l’outil, ou maintenez simplement le bouton du milieu de la souris.",
          "Glissez pour tourner autour du modèle.",
          "Relâchez : avec la molette, l’outil précédent reprend la main."
        ],
        tip: "double-cliquez avec la molette pour centrer la vue sur le point visé."
      },
      pan: {
        name: "Panoramique", en: "Pan", key: "H", cat: "camera", anim: "a-pan",
        def: "Fait glisser la vue à l’horizontale ou à la verticale, sans la faire tourner.",
        how: [
          "Activez l’outil Panoramique.",
          "Cliquez et glissez dans la zone de dessin.",
          "Raccourci souris : Maj + bouton du milieu."
        ],
        tip: "combinez molette (zoom), bouton du milieu (orbite) et Maj (panoramique) : vous ne changerez presque plus d’outil."
      },
      zoom: {
        name: "Zoom", en: "Zoom", key: "Z", cat: "camera", anim: "a-zoom",
        def: "Rapproche ou éloigne la caméra, vers le point situé sous le curseur.",
        how: [
          "Faites rouler la molette de la souris.",
          "Ou activez Zoom et glissez vers le haut ou vers le bas.",
          "Maj+Z lance le Zoom étendu pour voir tout le modèle."
        ],
        tip: "perdu dans la scène ? Maj+Z vous ramène toujours au modèle entier."
      }
    };

const STEPS = [
      {
        short: "Préparer", title: "Préparer le fichier",
        text: "Ouvrez SketchUp 2016. Dans l’écran de bienvenue, choisissez un modèle en mètres, puis lancez la modélisation.",
        acts: [
          { k: "Espace", t: "Sélectionnez le personnage d’échelle" },
          { k: "Suppr", t: "Supprimez-le pour libérer la scène" },
          { k: "Maj+Z", t: "Zoom étendu : cadrez la zone de travail" }
        ],
        tip: "Enregistrez tout de suite avec Ctrl+S, puis régulièrement. Activez aussi l’enregistrement automatique dans les Préférences."
      },
      {
        short: "Emprise", title: "Tracer l’emprise au sol",
        text: "Dessinez le sol de la maison : un rectangle de 10 m sur 7 m qui part de l’origine des axes.",
        acts: [
          { k: "R", t: "Activez l’outil Rectangle" },
          { k: "Clic", t: "Cliquez sur l’origine, puis éloignez la souris" },
          { k: "10m;7m", t: "Tapez les dimensions puis Entrée" }
        ],
        tip: "Sous Windows en français, le séparateur est « ; ». La face se crée dès que le rectangle est fermé."
      },
      {
        short: "Murs", title: "Monter les murs",
        text: "Transformez la face en volume : c’est le geste signature de SketchUp.",
        acts: [
          { k: "P", t: "Activez Pousser/Tirer" },
          { k: "Clic", t: "Cliquez sur la face et montez la souris" },
          { k: "5m", t: "Tapez la hauteur puis Entrée" }
        ],
        tip: "Un double-clic sur une autre face répète la dernière distance : très pratique pour les étages."
      },
      {
        short: "Ouvertures", title: "Percer portes et fenêtres",
        text: "Dessinez les ouvertures directement sur les façades, puis enfoncez-les dans le mur.",
        acts: [
          { k: "R", t: "Dessinez chaque fenêtre sur la façade" },
          { k: "P", t: "Poussez vers l’intérieur de 0,2 m" },
          { k: "M+Ctrl", t: "Copiez une fenêtre identique ailleurs" }
        ],
        tip: "Juste après une copie, tapez x3 puis Entrée pour obtenir trois fenêtres régulièrement espacées."
      },
      {
        short: "Toit", title: "Construire le toit",
        text: "Un toit à deux pans en deux gestes : une ligne de faîtage, puis on la soulève.",
        acts: [
          { k: "L", t: "Reliez les milieux des deux petits côtés du dessus" },
          { k: "M", t: "Sélectionnez cette ligne et déplacez-la vers le haut" },
          { k: "↑", t: "Verrouillez l’axe bleu, tapez 3m puis Entrée" }
        ],
        tip: "Le point cyan « Milieu » vous montre exactement le centre d’une arête : c’est une inférence."
      },
      {
        short: "Présenter", title: "Colorier et présenter",
        text: "Habillez le modèle de matières, puis transformez-le en présentation 3D animée.",
        acts: [
          { k: "B", t: "Appliquez des matières depuis le panneau Matières" },
          { k: "Scènes", t: "Fenêtre › Scènes : ajoutez une scène par point de vue" },
          { k: "Lire", t: "Affichage › Animation › Lire pour enchaîner les scènes" }
        ],
        tip: "Activez les ombres (Fenêtre › Ombres), puis exportez votre animation en vidéo via Fichier › Exporter › Animation."
      }
    ];

const CAT = { principal: "Principal", dessin: "Dessin", modif: "Modification", construction: "Construction", camera: "Caméra" };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// Restart the fade-in on a panel by swapping between two identical animations.
function swap(name) {
  $$('[data-swap="' + name + '"]').forEach((n) => {
    const a = n.classList.contains("swap-a");
    n.classList.toggle("swap-a", !a);
    n.classList.toggle("swap-b", a);
  });
}

/* ---------- Tools ---------- */
const toolState = { tool: "pushpull", cat: "all" };

function renderTool(animate) {
  const t = TOOLS[toolState.tool];
  $$(".tbtn").forEach((b) => {
    const id = b.dataset.tool;
    const on = id === toolState.tool;
    b.classList.toggle("is-on", on);
    b.classList.toggle("is-dim", toolState.cat !== "all" && TOOLS[id].cat !== toolState.cat);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  $$(".chip[data-cat]").forEach((c) => {
    const on = c.dataset.cat === toolState.cat;
    c.classList.toggle("is-on", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });

  $("#t-catLabel").textContent = CAT[t.cat];
  $("#t-name").textContent = t.name;
  $("#t-en").textContent = t.en;
  $("#t-key").textContent = t.key || "—";
  $("#t-keyLabel").textContent = t.key ? "Raccourci" : "Sans raccourci";
  $("#t-def").textContent = t.def;
  $("#t-tip").textContent = t.tip;

  const how = $("#t-how");
  how.replaceChildren(...t.how.map((txt, i) => {
    const row = el("div", "how");
    row.append(el("span", "how-n", "0" + (i + 1)), el("p", null, txt));
    return row;
  }));

  const isDraw = !!t.path;
  $("#t-draw").hidden = !isDraw;
  $("#t-scene").hidden = isDraw;
  if (isDraw) {
    const p = $("#t-path");
    // Replace the path node so its drawing animation restarts from the start.
    const fresh = p.cloneNode(false);
    fresh.setAttribute("d", t.path);
    fresh.setAttribute("class", t.face ? "dpath fill-on" : "dpath");
    fresh.style.strokeDasharray = t.len;
    fresh.style.strokeDashoffset = t.len;
    p.replaceWith(fresh);
    $("#t-base").setAttribute("d", t.base || "");
    const lab = $("#t-label");
    lab.textContent = t.label || "";
    lab.setAttribute("x", t.lx || 0);
    lab.setAttribute("y", t.ly || 0);
    const cur = $("#t-cur");
    const cfresh = cur.cloneNode(false);
    cfresh.style.offsetPath = "path('" + t.path + "')";
    cur.replaceWith(cfresh);
  } else {
    $("#t-world").className = "d-world " + (t.anim || "");
  }
  if (animate) swap("tool");
}

$$(".tbtn").forEach((b) => b.addEventListener("click", () => {
  toolState.tool = b.dataset.tool;
  renderTool(true);
}));
$$(".chip[data-cat]").forEach((c) => c.addEventListener("click", () => {
  const cat = c.dataset.cat;
  toolState.cat = cat;
  let changed = false;
  if (cat !== "all" && TOOLS[toolState.tool].cat !== cat) {
    toolState.tool = Object.keys(TOOLS).find((k) => TOOLS[k].cat === cat);
    changed = true;
  }
  renderTool(changed);
}));

/* ---------- Interface hotspots ---------- */
function renderSpot(i) {
  $$(".zone").forEach((z) => z.classList.toggle("is-on", z.dataset.zone === String(i)));
  $$(".hs").forEach((h) => h.classList.toggle("is-on", h.dataset.spot === String(i)));
  $$(".zli").forEach((z) => {
    const on = z.dataset.zli === String(i);
    z.classList.toggle("is-on", on);
    $(".zli-h", z).setAttribute("aria-expanded", on ? "true" : "false");
  });
}
$$("[data-spot]").forEach((b) => b.addEventListener("click", () => renderSpot(Number(b.dataset.spot))));

/* ---------- Tutorial ---------- */
let step = 0;
function renderStep(animate) {
  const st = STEPS[step];
  $$(".seg").forEach((b) => {
    const i = Number(b.dataset.step);
    b.classList.toggle("is-on", i === step);
    b.classList.toggle("is-done", i < step);
    if (i === step) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
  });
  $("#s-bar").style.width = (((step + 1) / STEPS.length) * 100).toFixed(2) + "%";
  $$(".s-num").forEach((n) => { n.textContent = "0" + (step + 1); });
  $("#s-title").textContent = st.title;
  $("#s-text").textContent = st.text;
  $("#s-tip").textContent = st.tip;
  $("#s-acts").replaceChildren(...st.acts.map((a) => {
    const row = el("div", "act");
    row.append(el("span", "kbd dk", a.k), el("span", null, a.t));
    return row;
  }));
  const vis = {
    foot: step >= 1, dimFoot: step === 1, walls: step >= 2, dimWall: step === 2,
    top: step >= 2 && step <= 3, open: step >= 3, roof: step >= 4, dimRoof: step === 4, scene: step >= 5
  };
  $$("[data-lay]").forEach((g) => {
    const on = !!vis[g.dataset.lay];
    g.classList.toggle("on", on);
    g.classList.toggle("off", !on);
  });
  $("#s-bp").classList.toggle("painted", step >= 5);
  const tabs = $("#s-tabs");
  tabs.classList.toggle("on", step >= 5);
  tabs.classList.toggle("off", step < 5);
  $("#s-prev").disabled = step === 0;
  $("#s-nextl").textContent = step >= STEPS.length - 1 ? "Recommencer" : "Étape suivante";
  if (animate) swap("step");
}
$$(".seg").forEach((b) => b.addEventListener("click", () => { step = Number(b.dataset.step); renderStep(true); }));
$("#s-prev").addEventListener("click", () => { step = Math.max(0, step - 1); renderStep(true); });
$("#s-next").addEventListener("click", () => { step = step >= STEPS.length - 1 ? 0 : step + 1; renderStep(true); });

/* ---------- FAQ ---------- */
let faq = 1;
function renderFaq() {
  $$(".faq").forEach((f) => {
    const on = Number(f.dataset.faq) === faq;
    f.classList.toggle("is-open", on);
    $(".faq-q", f).setAttribute("aria-expanded", on ? "true" : "false");
  });
}
$$("[data-faqbtn]").forEach((b) => b.addEventListener("click", () => {
  const i = Number(b.dataset.faqbtn);
  faq = faq === i ? 0 : i;
  renderFaq();
}));

renderTool(false);
renderSpot(3);
renderStep(false);
renderFaq();
