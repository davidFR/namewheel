const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const spinBtn = document.getElementById('spin');
const winnerDiv = document.getElementById('winner');
const wheelContainer = document.querySelector('.wheel-container');
const wheelLayout = document.getElementById('wheel-layout');
const themeOptionButtons = Array.from(document.querySelectorAll('.theme-option'));
const themeToggle = document.getElementById('theme-toggle');
const themePanel = document.getElementById('theme-panel');
const themeMenu = document.querySelector('.theme-menu');

const MIN_TURNS = 1.2; // nombre minimum de tours avant l'arret
const SPIN_DURATION_MS = 2200;
const POINTER_ANGLE = -Math.PI / 2; // flèche en haut
const MAX_NAMES = 500;
const MAX_LINE_LENGTH = 120;

let names = [];
let firstNames = [];
let currentWheelNames = [];
let spinning = false;
let rotation = 0;
let winnerIdx = null;
let remainingIndices = [];
let fireworksTimer = null;
let drawsSinceReset = 0;
let resetThreshold = 1;

const THEME_SETTINGS = {
  'dark-nord': {
    fireworks: ['#88c0d0', '#81a1c1', '#b48ead', '#a3be8c', '#ebcb8b']
  },
  'dark-one': {
    fireworks: ['#56b6c2', '#61afef', '#98c379', '#e5c07b', '#c678dd']
  },
  'dark-monokai': {
    fireworks: ['#a6e22e', '#fd971f', '#66d9ef', '#f92672', '#e6db74']
  },
  'dark-ayu': {
    fireworks: ['#39bae6', '#ffb454', '#95e6cb', '#f29668', '#d2a6ff']
  },
  'light-nord': {
    fireworks: ['#5e81ac', '#88c0d0', '#a3be8c', '#b48ead', '#d08770']
  },
  'light-rose-pine': {
    fireworks: ['#d7827e', '#286983', '#907aa9', '#56949f', '#ea9d34']
  },
  'light-sepia': {
    fireworks: ['#b5653a', '#7f5539', '#c08552', '#8b6f47', '#6f4e37']
  },
  'light-aurora': {
    fireworks: ['#00a6a6', '#007f8c', '#4cb5ae', '#66d1cc', '#2f8f9d']
  }
};

const DEFAULT_THEME = 'light-nord';

const LAST_NAME_TOKEN_REGEX = /^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’\-]*$/;

function getCssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function resolveTheme(theme) {
  return THEME_SETTINGS[theme] ? theme : DEFAULT_THEME;
}

function readStoredTheme() {
  try {
    return localStorage.getItem('namewheel-theme');
  } catch {
    return null;
  }
}

function applyTheme(theme, persist = true) {
  const safeTheme = resolveTheme(theme);
  document.body.dataset.theme = safeTheme;
  themeOptionButtons.forEach((button) => {
    const isActive = button.dataset.theme === safeTheme;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-current', isActive ? 'true' : 'false');
  });
  if (persist) {
    try {
      localStorage.setItem('namewheel-theme', safeTheme);
    } catch {
      // Ignore storage errors (private mode, permissions).
    }
  }
  drawWheel();
}

function getFireworkColors() {
  const activeTheme = resolveTheme(document.body.dataset.theme || DEFAULT_THEME);
  return THEME_SETTINGS[activeTheme].fireworks;
}

function getWheelPalette() {
  return {
    empty: getCssVar('--wheel-empty') || '#f2f2f2',
    segmentA: getCssVar('--wheel-segment-a') || '#fde7ea',
    segmentB: getCssVar('--wheel-segment-b') || '#f8d5db',
    winnerFill: getCssVar('--wheel-winner-fill') || '#e2001a',
    label: getCssVar('--wheel-label') || '#222',
    labelWinner: getCssVar('--wheel-label-winner') || '#fff',
    pointer: getCssVar('--pointer') || '#e2001a'
  };
}

function normalizeAngle(a) {
  const tau = Math.PI * 2;
  let n = a % tau;
  if (n < 0) n += tau;
  return n;
}

function randomInt(maxExclusive) {
  if (maxExclusive <= 0) return 0;
  if (window.crypto && window.crypto.getRandomValues) {
    // Rejection sampling pour eviter le biais de modulo.
    const uint32Max = 0x100000000;
    const limit = uint32Max - (uint32Max % maxExclusive);
    const buffer = new Uint32Array(1);
    let value;
    do {
      window.crypto.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= limit);
    return value % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

function pickUniqueWinnerIndex() {
  if (!remainingIndices.length) return null;
  const pos = randomInt(remainingIndices.length);
  return remainingIndices.splice(pos, 1)[0];
}

function clearFireworks() {
  if (fireworksTimer) {
    clearTimeout(fireworksTimer);
    fireworksTimer = null;
  }
  const existing = document.querySelector('.fireworks-layer');
  if (existing) {
    existing.remove();
  }
}

function launchFireworks() {
  clearFireworks();

  const layer = document.createElement('div');
  layer.className = 'fireworks-layer';

  const colors = getFireworkColors();
  const rect = winnerDiv.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const bursts = 3;
  const particlesPerBurst = 16;

  for (let b = 0; b < bursts; b++) {
    const burstAngle = (Math.PI * 2 * b) / bursts + Math.random() * 0.5;
    const originX = centerX + Math.cos(burstAngle) * 26;
    const originY = centerY + Math.sin(burstAngle) * 26;

    for (let i = 0; i < particlesPerBurst; i++) {
      const p = document.createElement('span');
      p.className = 'firework-particle';

      const angle = (Math.PI * 2 * i) / particlesPerBurst + Math.random() * 0.25;
      const distance = 45 + Math.random() * 75;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;

      p.style.setProperty('--x', `${originX}px`);
      p.style.setProperty('--y', `${originY}px`);
      p.style.setProperty('--dx', `${dx}px`);
      p.style.setProperty('--dy', `${dy}px`);
      p.style.setProperty('--delay', `${Math.floor(Math.random() * 120)}ms`);
      p.style.background = colors[randomInt(colors.length)];

      layer.appendChild(p);
    }
  }

  document.body.appendChild(layer);
  fireworksTimer = setTimeout(() => {
    layer.remove();
    fireworksTimer = null;
  }, 1300);
}

function showWinner(firstName, lastName) {
  const safeFirstName = firstName || 'Participant';
  const safeLastName = lastName || '';

  const firstNameEl = document.createElement('div');
  firstNameEl.className = 'winner-firstname';
  firstNameEl.textContent = safeFirstName;

  const lastNameEl = document.createElement('div');
  lastNameEl.className = 'winner-lastname';
  lastNameEl.textContent = safeLastName;

  winnerDiv.replaceChildren(firstNameEl, lastNameEl);
  setWinnerVisible(true);
  launchFireworks();
}

function setWinnerVisible(isVisible) {
  winnerDiv.classList.toggle('hidden', !isVisible);
  requestAnimationFrame(resizeCanvas);
}

function setThemePanelOpen(isOpen) {
  if (!themePanel || !themeToggle) return;
  themePanel.classList.toggle('hidden', !isOpen);
  themeToggle.setAttribute('aria-expanded', String(isOpen));
}

function resizeCanvas() {
  if (!wheelContainer) return;

  const bounds = wheelContainer.getBoundingClientRect();
  const maxSquare = Math.min(bounds.width, bounds.height);
  if (!Number.isFinite(maxSquare) || maxSquare <= 0) return;

  let size = Math.floor(maxSquare - 8);
  size = Math.max(120, size);
  if (size > maxSquare) {
    size = Math.floor(maxSquare);
  }

  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  drawWheel();
}

window.addEventListener('resize', resizeCanvas);

themeOptionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedTheme = button.dataset.theme;
    applyTheme(selectedTheme);
    setThemePanelOpen(false);
  });
});

if (themeToggle) {
  themeToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = !themePanel || themePanel.classList.contains('hidden');
    setThemePanelOpen(isOpen);
  });
}

document.addEventListener('click', (event) => {
  if (!themePanel || !themeMenu || themePanel.classList.contains('hidden')) return;
  if (themeMenu.contains(event.target)) return;
  setThemePanelOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setThemePanelOpen(false);
  }
});

applyTheme(readStoredTheme() || DEFAULT_THEME, false);
setThemePanelOpen(false);
setWinnerVisible(false);
resizeCanvas();

function refreshRemainingIndices() {
  remainingIndices = names.map((_, idx) => idx);
}

function maybeResetDrawMemory() {
  if (drawsSinceReset >= resetThreshold) {
    refreshRemainingIndices();
    drawsSinceReset = 0;
  }
}

function extractNameParts(rawLine) {
  const parts = rawLine.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;

  let idx = 0;
  const lastNameParts = [];
  while (idx < parts.length && LAST_NAME_TOKEN_REGEX.test(parts[idx])) {
    lastNameParts.push(parts[idx]);
    idx += 1;
  }

  const lastName = lastNameParts.length ? lastNameParts.join(' ') : parts[0];
  const firstName = parts.slice(idx).join(' ') || parts[0];

  return { firstName, lastName };
}

function computeUniformFontSize(radius, arc) {
  // Noms orientés radialement: on borne à la fois la longueur radiale et l'épaisseur de portion.
  const innerR = radius * 0.28;
  const outerR = radius - 16;
  const maxTextLength = outerR - innerR;
  const midR = innerR + maxTextLength * 0.5;
  const maxBand = Math.max(10, arc * midR * 0.72);

  let size = Math.max(10, Math.floor(radius / 9));
  while (size > 8) {
    ctx.font = `${size}px Inter, Arial, sans-serif`;
    let longest = 0;
    for (let i = 0; i < currentWheelNames.length; i++) {
      longest = Math.max(longest, ctx.measureText(currentWheelNames[i]).width);
    }
    if (longest <= maxTextLength && size <= maxBand) {
      return size;
    }
    size -= 1;
  }
  return 8;
}

function drawWheel() {
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = width / 2 - 10;

  ctx.clearRect(0, 0, width, height);
  const palette = getWheelPalette();

  if (!currentWheelNames.length) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = palette.empty;
    ctx.fill();
    drawPointer(cx, cy, radius, palette.pointer);
    return;
  }

  const n = currentWheelNames.length;
  const arc = (Math.PI * 2) / n;
  const outerR = radius - 16;
  const fontSize = computeUniformFontSize(radius, arc);

  for (let i = 0; i < n; i++) {
    const start = rotation + i * arc;
    const end = start + arc;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();

    if (!spinning && winnerIdx === i) {
      ctx.fillStyle = palette.winnerFill;
    } else {
      ctx.fillStyle = i % 2 === 0 ? palette.segmentA : palette.segmentB;
    }
    ctx.fill();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.font = `${fontSize}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < n; i++) {
    ctx.save();
    // Orientation du centre vers l'extérieur (radiale)
    ctx.rotate(i * arc + arc / 2);
    ctx.fillStyle = !spinning && winnerIdx === i ? palette.labelWinner : palette.label;
    ctx.fillText(currentWheelNames[i], outerR, 0);
    ctx.restore();
  }

  ctx.restore();
  drawPointer(cx, cy, radius, palette.pointer);
}

function drawPointer(cx, cy, radius, pointerColor) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius + 8);
  ctx.lineTo(cx - 18, cy - radius - 24);
  ctx.lineTo(cx + 18, cy - radius - 24);
  ctx.closePath();
  ctx.fillStyle = pointerColor;
  ctx.fill();
}

function computeFinalRotation(startRotation, arc, index) {
  // Centre de la portion gagnante aligné avec la flèche du haut.
  let target = POINTER_ANGLE - (index + 0.5) * arc;

  const minEnd = startRotation + MIN_TURNS * Math.PI * 2;
  while (target < minEnd) {
    target += Math.PI * 2;
  }
  return target;
}

function spin() {
  if (spinning || !names.length) return;

  maybeResetDrawMemory();
  if (!remainingIndices.length) {
    refreshRemainingIndices();
  }

  spinning = true;
  currentWheelNames = names.slice();
  winnerIdx = pickUniqueWinnerIndex();
  if (winnerIdx === null) {
    spinning = false;
    return;
  }

  setWinnerVisible(false);
  drawsSinceReset += 1;

  const startRotation = rotation;
  const arc = (Math.PI * 2) / currentWheelNames.length;
  const finalRotation = computeFinalRotation(startRotation, arc, winnerIdx);
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;

    const tRaw = Math.min(elapsed / SPIN_DURATION_MS, 1);
    // Deceleration continue: pas de rupture de phase, donc pas d'effet de "retour" visuel.
    const tEase = 1 - Math.pow(1 - tRaw, 3);
    rotation = startRotation + (finalRotation - startRotation) * tEase;
    drawWheel();

    if (tRaw < 1) {
      requestAnimationFrame(animate);
      return;
    }

    rotation = normalizeAngle(finalRotation);
    spinning = false;
    drawWheel();

    showWinner(firstNames[winnerIdx], currentWheelNames[winnerIdx]);
  }

  requestAnimationFrame(animate);
}

canvas.addEventListener('click', spin);
if (spinBtn) {
  spinBtn.addEventListener('click', spin);
}

fetch('noms.txt')
  .then((r) => {
    if (!r.ok) {
      throw new Error(`Impossible de charger noms.txt (HTTP ${r.status})`);
    }
    return r.text();
  })
  .then((text) => {
    const parsedNames = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, MAX_NAMES)
      .map((line) => extractNameParts(line.slice(0, MAX_LINE_LENGTH)))
      .filter(Boolean);

    names = parsedNames.map((entry) => entry.lastName || entry.firstName);
    firstNames = parsedNames.map((entry) => entry.firstName || entry.lastName || 'Participant');
    currentWheelNames = names.slice();
    resetThreshold = Math.max(1, Math.ceil(names.length / 2));
    drawsSinceReset = 0;
    refreshRemainingIndices();
    drawWheel();
  })
  .catch(() => {
    names = [];
    firstNames = [];
    currentWheelNames = [];
    remainingIndices = [];
    drawsSinceReset = 0;
    resetThreshold = 1;
    setWinnerVisible(false);
    drawWheel();
  });
