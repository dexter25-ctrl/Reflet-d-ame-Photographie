/**
 * ================================================================
 * REFLET D'ÂME — PHOTOGRAPHIE
 * main.js — Moteur visuel Three.js + Interactions UI
 *
 * Ce fichier gère :
 *  1. La scène Three.js (fond spatial + nébuleuses)
 *  2. Le système de particules "poussière de diamants"
 *  3. L'effet de parallaxe à la souris
 *  4. La navigation par onglets
 *  5. Le formulaire de contact
 * ================================================================
 */

'use strict';

/* ================================================================
   SECTION 1 — SCÈNE THREE.JS
   Fond spatial animé persistant sur tous les onglets
================================================================ */

/**
 * Initialise et anime la scène Three.js.
 * Crée un fond étoilé avec nébuleuses et un système de particules
 * "diamants" qui orbitent autour de l'origine (là où se trouvent les personnes).
 */
function initThreeScene() {

  const canvas  = document.getElementById('three-canvas');
  const W       = window.innerWidth;
  const H       = window.innerHeight;

  /* ---- Renderer ---- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);

  /* ---- Scène & Caméra ---- */
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
  camera.position.set(0, 0, 5);

  /* ---- Couleur de fond ---- */
  scene.background = new THREE.Color(0x04040a);

  /* ========================================================
     1A. CHAMP D'ÉTOILES DE FOND
     Petits points blancs/bleutés très nombreux, immobiles
  ======================================================== */
  const STAR_COUNT = 4000;

  // Positions aléatoires dans une sphère
  const starPositions = new Float32Array(STAR_COUNT * 3);
  const starColors    = new Float32Array(STAR_COUNT * 3);

  for (let i = 0; i < STAR_COUNT; i++) {
    const i3 = i * 3;

    // Coordonnées sphériques aléatoires
    const radius  = 50 + Math.random() * 200;
    const theta   = Math.random() * Math.PI * 2;
    const phi     = Math.acos(2 * Math.random() - 1);

    starPositions[i3]     = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    starPositions[i3 + 2] = radius * Math.cos(phi);

    // Couleur : blanc chaud, bleuté ou légèrement doré
    const colorVariant = Math.random();
    if (colorVariant < 0.3) {
      // Bleuté
      starColors[i3] = 0.7; starColors[i3+1] = 0.8; starColors[i3+2] = 1.0;
    } else if (colorVariant < 0.5) {
      // Doré pâle
      starColors[i3] = 1.0; starColors[i3+1] = 0.92; starColors[i3+2] = 0.7;
    } else {
      // Blanc
      starColors[i3] = 1.0; starColors[i3+1] = 1.0; starColors[i3+2] = 1.0;
    }
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('color',    new THREE.BufferAttribute(starColors, 3));

  const starMat = new THREE.PointsMaterial({
    size:         0.08,
    vertexColors: true,
    transparent:  true,
    opacity:      0.85,
    sizeAttenuation: true,
  });

  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  /* ========================================================
     1B. NÉBULEUSES — Nuages lumineux diffus en arrière-plan
     Créées avec des sprites semi-transparents
  ======================================================== */
  const nebulaConfigs = [
    { x: -8,  y:  3,  z: -30, size: 18, color: 0x1a0a3a, opacity: 0.4 },
    { x:  6,  y: -2,  z: -25, size: 14, color: 0x0a1a3a, opacity: 0.3 },
    { x:  0,  y:  5,  z: -35, size: 22, color: 0x2a0a1a, opacity: 0.25 },
    { x: -4,  y: -6,  z: -20, size: 10, color: 0x0a0a2a, opacity: 0.35 },
  ];

  // Crée une texture dégradée circulaire pour chaque nébuleuse
  function createNebulaTexture(color) {
    const size = 256;
    const cvs  = document.createElement('canvas');
    cvs.width  = size;
    cvs.height = size;
    const ctx  = cvs.getContext('2d');

    // Extraire les composantes RGB depuis le nombre hexadécimal (ex: 0x1a0a3a)
    const r = (color >> 16) & 0xff;
    const g = (color >>  8) & 0xff;
    const b =  color        & 0xff;

    // Gradient radial du centre vers l'extérieur — rgba() valide
    const grad = ctx.createRadialGradient(
      size/2, size/2, 0,
      size/2, size/2, size/2
    );
    grad.addColorStop(0,   `rgba(${r},${g},${b},1)`);    // Centre opaque
    grad.addColorStop(0.5, `rgba(${r},${g},${b},0.5)`);  // Mi-chemin
    grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);    // Bord transparent

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(cvs);
  }

  nebulaConfigs.forEach(cfg => {
    const mat = new THREE.SpriteMaterial({
      map:         createNebulaTexture(cfg.color),
      transparent: true,
      opacity:     cfg.opacity,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(cfg.x, cfg.y, cfg.z);
    sprite.scale.set(cfg.size, cfg.size, 1);
    scene.add(sprite);
  });

  /* ========================================================
     1C. SYSTÈME DE PARTICULES "POUSSIÈRE DE DIAMANTS"
     Ces particules orbitent autour des personnes :
     - Certaines passent DEVANT  (z > position des personnes)
     - Certaines passent DERRIÈRE (z < position des personnes)
  ======================================================== */
  const DIAMOND_COUNT = 280;

  // Données par particule (stockées pour l'animation)
  const diamondData = [];

  const diamondPositions = new Float32Array(DIAMOND_COUNT * 3);
  const diamondColors    = new Float32Array(DIAMOND_COUNT * 3);
  const diamondSizes     = new Float32Array(DIAMOND_COUNT);

  for (let i = 0; i < DIAMOND_COUNT; i++) {
    const i3 = i * 3;

    // Orbite elliptique autour du centre (personnes)
    const orbitA     = 1.5 + Math.random() * 2.5;   // Demi-axe horizontal
    const orbitB     = 0.8 + Math.random() * 1.8;   // Demi-axe vertical
    const orbitZ     = (Math.random() - 0.5) * 4;   // Profondeur : devant/derrière
    const phase      = Math.random() * Math.PI * 2; // Phase initiale
    const speed      = 0.08 + Math.random() * 0.25; // Vitesse orbitale
    const tilt       = (Math.random() - 0.5) * 0.8; // Inclinaison du plan d'orbite
    const scintilFreq = 2 + Math.random() * 6;       // Fréquence de scintillement
    const scintilPhs  = Math.random() * Math.PI * 2; // Phase de scintillement

    diamondData.push({ orbitA, orbitB, orbitZ, phase, speed, tilt, scintilFreq, scintilPhs });

    // Position initiale
    const angle = phase;
    diamondPositions[i3]     = orbitA * Math.cos(angle);
    diamondPositions[i3 + 1] = orbitB * Math.sin(angle) + tilt * orbitA * Math.cos(angle);
    diamondPositions[i3 + 2] = orbitZ;

    // Couleur : blanc cristallin, doré ou bleu diamant
    const c = Math.random();
    if (c < 0.4) {
      // Blanc pur / cristallin
      diamondColors[i3] = 1.0; diamondColors[i3+1] = 1.0; diamondColors[i3+2] = 1.0;
    } else if (c < 0.65) {
      // Or chaud
      diamondColors[i3] = 1.0; diamondColors[i3+1] = 0.88; diamondColors[i3+2] = 0.55;
    } else if (c < 0.85) {
      // Bleu glacier
      diamondColors[i3] = 0.55; diamondColors[i3+1] = 0.8; diamondColors[i3+2] = 1.0;
    } else {
      // Rose pâle
      diamondColors[i3] = 1.0; diamondColors[i3+1] = 0.75; diamondColors[i3+2] = 0.85;
    }

    // Taille variable
    diamondSizes[i] = 0.04 + Math.random() * 0.12;
  }

  const diamondGeo = new THREE.BufferGeometry();
  diamondGeo.setAttribute('position', new THREE.BufferAttribute(diamondPositions, 3));
  diamondGeo.setAttribute('color',    new THREE.BufferAttribute(diamondColors, 3));
  diamondGeo.setAttribute('size',     new THREE.BufferAttribute(diamondSizes, 1));

  // Texture de particule : point lumineux avec halo
  function createDiamondTexture() {
    const size = 128;
    const cvs  = document.createElement('canvas');
    cvs.width  = size;
    cvs.height = size;
    const ctx  = cvs.getContext('2d');

    // Halo externe
    const outerGrad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    outerGrad.addColorStop(0,   'rgba(255,255,255,1)');
    outerGrad.addColorStop(0.15,'rgba(255,255,255,0.9)');
    outerGrad.addColorStop(0.4, 'rgba(200,220,255,0.4)');
    outerGrad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = outerGrad;
    ctx.fillRect(0, 0, size, size);

    // Cœur brillant
    const innerGrad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/8);
    innerGrad.addColorStop(0,   'rgba(255,255,255,1)');
    innerGrad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = innerGrad;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(cvs);
  }

  const diamondMat = new THREE.PointsMaterial({
    size:         0.18,
    map:          createDiamondTexture(),
    vertexColors: true,
    transparent:  true,
    opacity:      0.95,
    blending:     THREE.AdditiveBlending,  // Fusion additive pour l'éclat
    depthWrite:   false,
    sizeAttenuation: true,
  });

  const diamonds = new THREE.Points(diamondGeo, diamondMat);
  scene.add(diamonds);

  /* ========================================================
     1D. BOUCLE D'ANIMATION THREE.JS
  ======================================================== */
  let animTime = 0;

  function animateScene() {
    requestAnimationFrame(animateScene);
    animTime += 0.008;

    const posAttr  = diamondGeo.getAttribute('position');
    const sizeAttr = diamondGeo.getAttribute('size');

    // Mise à jour de chaque particule diamant
    for (let i = 0; i < DIAMOND_COUNT; i++) {
      const d     = diamondData[i];
      const angle = d.phase + animTime * d.speed;
      const i3    = i * 3;

      // Position orbitale elliptique
      posAttr.array[i3]     = d.orbitA * Math.cos(angle);
      posAttr.array[i3 + 1] = d.orbitB * Math.sin(angle) + d.tilt * d.orbitA * Math.cos(angle);
      posAttr.array[i3 + 2] = d.orbitZ * Math.sin(angle * 0.3 + d.phase); // Ondulation en Z

      // Scintillement : variation de taille sinusoïdale
      const scintil = 0.6 + 0.4 * Math.abs(Math.sin(animTime * d.scintilFreq + d.scintilPhs));
      sizeAttr.array[i] = (0.04 + Math.random() * 0.12) * scintil;
    }

    posAttr.needsUpdate  = true;
    sizeAttr.needsUpdate = true;

    // Légère rotation lente du champ d'étoiles
    stars.rotation.y = animTime * 0.005;
    stars.rotation.x = animTime * 0.002;

    // Application de la cible de parallaxe caméra (définie par la souris)
    camera.position.x += (cameraTarget.x - camera.position.x) * 0.04;
    camera.position.y += (cameraTarget.y - camera.position.y) * 0.04;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  }

  animateScene();

  /* ========================================================
     1E. REDIMENSIONNEMENT FENÊTRE
  ======================================================== */
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}


/* ================================================================
   SECTION 2 — PARALLAXE À LA SOURIS
   La caméra Three.js et l'image des personnes réagissent
   à des vitesses différentes pour créer l'effet de profondeur 3D
================================================================ */

/**
 * Cible de position caméra — mise à jour par le listener souris,
 * lissée dans la boucle d'animation Three.js
 */
const cameraTarget = { x: 0, y: 0 };

/**
 * Initialise le système de parallaxe.
 * - La caméra (fond + diamants) bouge fortement
 * - L'image des personnes bouge doucement (effet de profondeur)
 */
function initParallax() {

  const subjectsLayer = document.getElementById('subjects-layer');

  // Intensité du mouvement de chaque couche
  const CAMERA_STRENGTH  = 0.8;   // Mouvement de la caméra (fond + diamants)
  const SUBJECT_STRENGTH = 0.025; // Mouvement de l'image (plan intermédiaire)

  // Position de souris normalisée [-1 ; 1]
  let mouseX = 0;
  let mouseY = 0;

  // Position actuelle lissée de l'image des personnes
  let subjectCurrentX = 0;
  let subjectCurrentY = 0;

  window.addEventListener('mousemove', (e) => {
    // Normalise : centre de l'écran = (0,0), coins = ±1
    mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;

    // Mise à jour de la cible caméra (lissage dans la boucle Three.js)
    cameraTarget.x =  mouseX * CAMERA_STRENGTH;
    cameraTarget.y = -mouseY * CAMERA_STRENGTH;
  });

  // Lissage du déplacement de l'image des personnes via RAF
  function updateSubjectsParallax() {
    // Lerp vers la cible
    subjectCurrentX += (mouseX * SUBJECT_STRENGTH * window.innerWidth  - subjectCurrentX) * 0.06;
    subjectCurrentY += (mouseY * SUBJECT_STRENGTH * window.innerHeight - subjectCurrentY) * 0.06;

    // Application du transform (translateX(-50%) préservé depuis le CSS)
    subjectsLayer.style.transform = `translateX(calc(-50% + ${subjectCurrentX}px)) translateY(${subjectCurrentY}px)`;

    requestAnimationFrame(updateSubjectsParallax);
  }

  updateSubjectsParallax();
}


/* ================================================================
   SECTION 3 — NAVIGATION PAR ONGLETS
   Gère la visibilité des sections et les transitions fluides.
   Le fond animé (canvas) reste toujours visible.
================================================================ */

/**
 * Initialise le système de navigation par onglets.
 * Chaque bouton .nav-tab correspond à une section .tab-content.
 * La transition est CSS-driven (opacity + translateY).
 */
function initTabNavigation() {

  const tabs          = document.querySelectorAll('.nav-tab');
  const panels        = document.querySelectorAll('.tab-content');
  const subjectsLayer = document.getElementById('subjects-layer');

  /**
   * Active un onglet par son identifiant (ex: 'home', 'portfolio').
   * Gère aussi la visibilité de l'image des personnes :
   * - Visible sur l'onglet Accueil
   * - Masquée (fondu) sur les autres onglets
   * @param {string} targetId - Valeur de l'attribut data-tab
   */
  function activateTab(targetId) {
    // Désactive tous les onglets et panneaux
    tabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    panels.forEach(p => p.classList.remove('active'));

    // Active l'onglet et le panneau correspondants
    const activeTab   = document.querySelector(`.nav-tab[data-tab="${targetId}"]`);
    const activePanel = document.getElementById(`tab-panel-${targetId}`);

    if (activeTab)  {
      activeTab.classList.add('active');
      activeTab.setAttribute('aria-selected', 'true');
    }
    if (activePanel) activePanel.classList.add('active');

    // Masque l'image des personnes quand on n'est pas sur l'accueil
    if (subjectsLayer) {
      if (targetId === 'home') {
        subjectsLayer.classList.remove('subjects-hidden');
      } else {
        subjectsLayer.classList.add('subjects-hidden');
      }
    }
  }

  // Ajout des listeners sur chaque onglet
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      activateTab(tab.dataset.tab);
    });
  });

  // Bouton CTA "Découvrir le Portfolio" sur l'accueil
  const ctaPortfolio = document.getElementById('cta-portfolio');
  if (ctaPortfolio) {
    ctaPortfolio.addEventListener('click', () => activateTab('portfolio'));
  }
}


/* ================================================================
   SECTION 4 — FORMULAIRE DE CONTACT
   Validation simple côté client et feedback utilisateur.
   Adapter la logique d'envoi à votre backend/service email.
================================================================ */

/**
 * Initialise le formulaire de contact.
 * Actuellement : validation + message de confirmation simulé.
 * Pour un vrai envoi, remplacer le contenu de submitForm().
 */
function initContactForm() {

  const form     = document.getElementById('contact-form');
  const feedback = document.getElementById('form-feedback');

  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name    = document.getElementById('contact-name').value.trim();
    const email   = document.getElementById('contact-email').value.trim();
    const message = document.getElementById('contact-message').value.trim();

    // Validation basique
    if (!name || !email || !message) {
      showFeedback('Merci de remplir tous les champs obligatoires.', 'error');
      return;
    }

    if (!isValidEmail(email)) {
      showFeedback('Adresse e-mail invalide.', 'error');
      return;
    }

    // ============================================================
    // TODO : Remplacer par un vrai appel API / service email
    // Exemple avec EmailJS :
    //   emailjs.send('service_id', 'template_id', { name, email, message })
    //     .then(() => showFeedback('Message envoyé !', 'success'))
    //     .catch(() => showFeedback('Erreur, réessayez.', 'error'));
    // ============================================================
    showFeedback(`Merci ${name}, votre message a bien été reçu. Nous vous répondrons sous 48h.`, 'success');
    form.reset();
  });

  function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.style.color = type === 'error'
      ? 'rgba(255,120,100,0.9)'
      : 'var(--color-gold)';
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}


/* ================================================================
   SECTION 5 — INITIALISATION GLOBALE
   Point d'entrée principal — tout est lancé ici au chargement
================================================================ */

/**
 * Lance tous les modules au chargement de la page.
 */
document.addEventListener('DOMContentLoaded', () => {

  try {
    initThreeScene();       // 1. Scène Three.js (fond + particules)
    initParallax();         // 2. Parallaxe souris
    initTabNavigation();    // 3. Système d'onglets
    initContactForm();      // 4. Formulaire de contact
  } catch (err) {
    console.error('[Reflet d\'Âme] Erreur d\'initialisation :', err);
  }

  // Indicateur de chargement : on peut ajouter une classe au body
  // document.body.classList.add('loaded');

  console.log(
    '%c Reflet d\'Âme Photographie ',
    'background:#0d0d30;color:#c9a96e;font-size:14px;padding:6px 12px;border:1px solid #c9a96e;',
    '\nCode structuré et commenté — Prêt pour l\'ajout de galeries photo.'
  );
});
