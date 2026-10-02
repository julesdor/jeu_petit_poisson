// ====== RÉGLAGES (à modifier pour équilibrer le jeu) ======
const CONFIG = {
  duration: 50,     // secondes avant le trou de mémoire
  startBrain: 40,   // % de cerveau au départ
  gainPerPair: 10,  // % gagnés par paire
  lossPerTick: 1,   // % perdus à chaque tick
  tickMs: 500       // un tick toutes les 0,5 s => ~2 % par seconde
};

const SYMBOLS = ['🐠', '🐚', '🦀', '🌸', '🍀', '⭐', '🌊', '🐙', '🍄', '🔔', '🎋', '🀄'];

// ====== ÉLÉMENTS ======
const $ = (id) => document.getElementById(id);
const boardEl = $('board'), fishEl = $('fish'), bowlEl = $('bowl'), sceneEl = $('scene');
const overlay = $('overlay'), card = $('card');

// ====== ÉTAT ======
let brain, ticks, timer, selected, locked, running;

// ====== OUTILS ======
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

function floatText(text) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.left = 35 + Math.random() * 30 + '%';
  sceneEl.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// ====== PLATEAU MAHJONG ======
// Chaque tuile : x, y (en demi-tuiles) et z (étage). 34 tuiles = 17 paires.
const LAYOUT = [];
for (let y = 0; y <= 6; y += 2) for (let x = 0; x <= 10; x += 2) LAYOUT.push({ x, y, z: 0 }); // étage 0 : 24 tuiles
for (let y = 2; y <= 4; y += 2) for (let x = 2; x <= 8; x += 2) LAYOUT.push({ x, y, z: 1 });  // étage 1 : 8 tuiles
LAYOUT.push({ x: 4, y: 3, z: 2 }, { x: 6, y: 3, z: 2 });                                      // étage 2 : 2 tuiles

let tiles = [];

// Une tuile est libre si : rien dessus ET (côté gauche libre OU côté droit libre)
function isFree(t, list) {
  const near = (o) => Math.abs(o.y - t.y) < 2;
  const covered = list.some((o) => o.z === t.z + 1 && Math.abs(o.x - t.x) < 2 && near(o));
  const left = list.some((o) => o.z === t.z && o.x === t.x - 2 && near(o));
  const right = list.some((o) => o.z === t.z && o.x === t.x + 2 && near(o));
  return !covered && (!left || !right);
}

// Distribue les symboles en "démontant" le plateau paire par paire :
// le plateau est donc toujours faisable.
function assignSymbols(list) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const rem = [...list];
    const pairs = [];
    while (rem.length) {
      const free = rem.filter((t) => isFree(t, rem));
      if (free.length < 2) break;
      const [a, b] = shuffle(free);
      pairs.push([a, b]);
      rem.splice(rem.indexOf(a), 1);
      rem.splice(rem.indexOf(b), 1);
    }
    if (rem.length === 0) {
      const syms = shuffle([...SYMBOLS]);
      pairs.forEach(([a, b], i) => { a.symbol = b.symbol = syms[i % syms.length]; });
      return;
    }
  }
}

function layoutTiles() {
  const u = Math.max(14, Math.min(32, (boardEl.clientWidth - 70) / 12.6));
  const field = boardEl.firstChild;
  if (!field) return;
  field.style.width = u * 12 + 10 + 'px';
  field.style.height = u * 1.25 * 8 + 12 + 'px';
  tiles.forEach((t) => {
    Object.assign(t.el.style, {
      left: t.x * u + t.z * 5 + 'px',
      top: t.y * u * 1.25 - t.z * 6 + 'px',
      width: u * 2 + 'px',
      height: u * 2.5 + 'px',
      fontSize: u * 1.35 + 'px',
      zIndex: t.z * 10 + t.y
    });
  });
}

function refreshFree() {
  const rem = tiles.filter((t) => !t.removed);
  rem.forEach((t) => {
    const free = isFree(t, rem);
    t.el.classList.toggle('free', free);
    t.el.classList.toggle('blocked', !free);
  });
  return rem;
}

function buildBoard() {
  boardEl.innerHTML = '';
  const field = document.createElement('div');
  field.className = 'field';
  boardEl.appendChild(field);

  tiles = LAYOUT.map((p) => ({ ...p, removed: false }));
  assignSymbols(tiles);
  tiles.forEach((t) => {
    t.el = document.createElement('button');
    t.el.className = 'tile';
    t.el.addEventListener('click', () => onTileClick(t));
    field.appendChild(t.el);
    showSymbol(t);
  });
  selected = null;
  locked = false;
  layoutTiles();
  refreshFree();
}

function showSymbol(t) {
  t.el.textContent = t.symbol;
  t.el.setAttribute('aria-label', 'Tuile ' + t.symbol);
}

// S'il n'y a plus de paire jouable, on remélange les tuiles restantes
function ensureMove() {
  const rem = tiles.filter((t) => !t.removed);
  if (!rem.length) return;
  const free = rem.filter((t) => isFree(t, rem));
  const hasPair = free.some((a, i) => free.some((b, j) => i !== j && a.symbol === b.symbol));
  if (!hasPair) {
    assignSymbols(rem);
    rem.forEach(showSymbol);
    floatText('Mélange !');
  }
}

function onTileClick(t) {
  if (!running || locked || t === selected || t.removed) return;
  if (t.el.classList.contains('blocked')) {
    t.el.classList.add('wrong');
    setTimeout(() => t.el.classList.remove('wrong'), 400);
    return;
  }
  t.el.classList.add('selected');
  if (!selected) { selected = t; return; }

  const first = selected;
  selected = null;

  if (first.symbol === t.symbol) {
    [first, t].forEach((x) => { x.removed = true; x.el.classList.add('matched'); });
    addBrain(CONFIG.gainPerPair);
    floatText('+' + CONFIG.gainPerPair + '%');
    const rem = refreshFree();
    if (!rem.length) {
      locked = true;
      setTimeout(() => { if (running) buildBoard(); }, 500); // nouveau plateau
    } else {
      ensureMove();
    }
  } else {
    locked = true;
    first.el.classList.add('wrong');
    t.el.classList.add('wrong');
    setTimeout(() => {
      [first, t].forEach((x) => x.el.classList.remove('wrong', 'selected'));
      locked = false;
    }, 400);
  }
}

window.addEventListener('resize', layoutTiles);

// ====== CERVEAU / CHRONO ======
function addBrain(amount) {
  brain = Math.max(0, Math.min(100, brain + amount));
  renderBrain();
  if (brain >= 100) endGame(true);
}

function renderBrain() {
  $('brainFill').style.setProperty('--empty', 8 + (100 - brain) * 0.84 + '%');
  $('brainPct').textContent = Math.round(brain) + '%';
  bowlEl.classList.toggle('foggy', brain < 25);
  fishEl.classList.toggle('fast', brain < 25);
  fishEl.classList.toggle('slow', brain > 75);
}

function renderTimer() {
  const left = Math.max(0, CONFIG.duration - (ticks * CONFIG.tickMs) / 1000);
  $('timerText').textContent = Math.ceil(left) + ' s';
  $('timerBar').style.width = (left / CONFIG.duration) * 100 + '%';
  $('timerBar').classList.toggle('danger', left <= 10);
  return left;
}

function tick() {
  ticks++;
  brain = Math.max(0, brain - CONFIG.lossPerTick);
  renderBrain();
  if (renderTimer() <= 0) endGame(false);
}

// ====== PARTIE ======
function startGame() {
  clearInterval(timer);
  brain = CONFIG.startBrain;
  ticks = 0;
  running = true;
  overlay.classList.remove('show', 'ocean');
  overlay.querySelectorAll('.ocean-extra').forEach((f) => f.remove());
  $('stage').innerHTML = '';
  buildBoard();
  renderBrain();
  renderTimer();
  timer = setInterval(tick, CONFIG.tickMs);
}

function endGame(won) {
  running = false;
  clearInterval(timer);
  overlay.classList.add('show');
  overlay.classList.toggle('ocean', won);
  const stage = $('stage');
  const fishSvg = fishEl.querySelector('svg').outerHTML;

  if (won) {
    $('ovTitle').textContent = "L'océan, enfin !";
    $('ovText').textContent = 'Ton cerveau est à 100 %. Tu sautes hors du bocal et tu rejoins les vagues.';
    $('startBtn').textContent = 'Rejouer';
    stage.innerHTML = '<span class="big-brain">🧠</span>' +
      '<span class="spark s1">✨</span><span class="spark s2">✨</span><span class="spark s3">✨</span><span class="spark s4">✨</span>';
    // 3 poissons qui sautent, puis les vagues par-dessus
    [0, -2.3, -4.6].forEach((delay, i) => {
      const f = document.createElement('div');
      f.className = 'jx ocean-extra';
      f.style.animationDelay = delay + 's';
      f.style.width = 90 - i * 14 + 'px';
      f.innerHTML = '<div class="jy" style="animation-delay:' + delay * 0.6 + 's">' + fishSvg + '</div>';
      overlay.appendChild(f);
    });
    ['', 'w2'].forEach((cls) => {
      const w = document.createElement('div');
      w.className = 'wave ocean-extra ' + cls;
      overlay.appendChild(w);
    });
  } else {
    $('ovTitle').textContent = 'Trou de mémoire…';
    $('ovText').textContent = 'Le temps est écoulé, tu as tout oublié. Qui es-tu ? Où est-ce que tu nages ? Recommence la partie.';
    $('startBtn').textContent = 'Réessayer';
    stage.innerHTML = '<div class="dz-fish">' + fishSvg + '</div>' +
      '<span class="q q1">?</span><span class="q q2">?</span><span class="q q3">?</span>';
  }
}

$('startBtn').addEventListener('click', startGame);

// Effet 3D : le bocal suit la souris
document.addEventListener('mousemove', (e) => {
  const x = (e.clientX / window.innerWidth - 0.5) * 2;
  const y = (e.clientY / window.innerHeight - 0.5) * 2;
  bowlEl.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 10}deg)`;
});

// Affichage initial de la jauge
brain = CONFIG.startBrain;
renderBrain();