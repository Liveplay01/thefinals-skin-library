/* ═══════════════════════════════════════════════════════════════════════════
   THE FINALS SKIN LIBRARY — app.js
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Constants ───────────────────────────────────────────────────────────────

const TIER_COLORS = {
  S: '#ffd700', A: '#e91e63', B: '#9c27b0', C: '#2196f3', D: '#9e9e9e',
};
const TIER_LABELS = {
  S: 'Unobtainable', A: 'Highly Limited', B: 'Ranked / Special', C: 'Earnable', D: 'Basic',
};
const RARITY_COLORS = {
  MYTHIC: '#e91e63', LEGENDARY: '#f59e0b', EPIC: '#8b5cf6', RARE: '#3b82f6', COMMON: '#94a3b8',
};
const TIER_ORDER   = { S: 0, A: 1, B: 2, C: 3, D: 4 };
const RARITY_ORDER = { MYTHIC: 0, LEGENDARY: 1, EPIC: 2, RARE: 3, COMMON: 4 };

// ── State ───────────────────────────────────────────────────────────────────

let allSkins     = [];
let filteredSkins = [];
let dbMeta       = {};
let activeModal  = null;
let cardObserver = null;

const filters = {
  search: '',
  build:  'all',
  weapon: 'all',
  rarity: 'all',
  tier:   'all',
  sort:   'tier',
};

// ── Bootstrap ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  createParticles();
  setupScrollListener();
  setupModalListeners();
  setupLegendFilters();
  setupPageNav();
  setupColFilters();
  setupCollectionActions();

  try {
    await loadData();
    setupFilters();
    applyFilters();
    updateNavCollectionCount();
  } catch (err) {
    console.error('Failed to load skin data:', err);
    showLoadError();
  }
});

// ── Data Loading ────────────────────────────────────────────────────────────

async function loadData() {
  const resp = await fetch('data/web_skins.json');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();

  allSkins = data.skins || [];
  dbMeta   = { version: data.version, last_updated: data.last_updated, total: data.total };

  updateHeroStats();
  updateFooter();
  populateWeaponFilter();
}

function showLoadError() {
  const grid = document.getElementById('skin-grid');
  grid.innerHTML = `
    <div class="loading-state">
      <p style="color:#ef4444">⚠ Could not load skin data.</p>
      <p style="font-size:0.8rem;margin-top:8px">
        Run <code style="background:#111;padding:2px 6px;border-radius:3px">python data/prepare_web_data.py --local skin_db.json</code>
        to generate <code style="background:#111;padding:2px 6px;border-radius:3px">data/web_skins.json</code>.
      </p>
    </div>`;
}

// ── Hero Stats (count-up animation) ─────────────────────────────────────────

function updateHeroStats() {
  const sTier = allSkins.filter(s => s.tier === 'S').length;
  const wnr   = allSkins.filter(s => s.will_not_return).length;

  animateCount('stat-total',   allSkins.length, '', 1400);
  animateCount('stat-s-tier',  sTier, '', 1600);
  animateCount('stat-wnr',     wnr,   '', 1800);

  const updated = document.getElementById('stat-updated');
  if (updated && dbMeta.last_updated) updated.textContent = dbMeta.last_updated;
}

function animateCount(id, target, suffix = '', duration = 1400) {
  const el = document.getElementById(id);
  if (!el) return;
  const startTime = performance.now();
  const step = (now) => {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = Math.round(target * eased).toLocaleString() + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateFooter() {
  const el = document.getElementById('footer-meta');
  if (!el) return;
  el.textContent = `${(allSkins.length).toLocaleString()} skins · Updated ${dbMeta.last_updated || '—'}`;
}

// ── Filter Setup ─────────────────────────────────────────────────────────────

function setupFilters() {
  const search     = document.getElementById('search');
  const searchClear = document.getElementById('search-clear');
  const resetBtn   = document.getElementById('reset-btn');

  // Search input
  search.addEventListener('input', debounce(e => {
    filters.search = e.target.value.trim().toLowerCase();
    searchClear.hidden = !filters.search;
    applyFilters();
  }, 140));

  searchClear.addEventListener('click', () => {
    search.value = '';
    filters.search = '';
    searchClear.hidden = true;
    applyFilters();
  });

  // Build — cascades to weapon dropdown
  document.getElementById('filter-build').addEventListener('change', e => {
    filters.build = e.target.value;
    filters.weapon = 'all';
    document.getElementById('filter-weapon').value = 'all';
    populateWeaponFilter();
    applyFilters();
  });

  // Other selects
  [
    ['filter-weapon', 'weapon'],
    ['filter-rarity', 'rarity'],
    ['filter-tier',   'tier'],
    ['sort-by',       'sort'],
  ].forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', e => {
      filters[key] = e.target.value;
      applyFilters();
    });
  });

  // Reset button
  resetBtn.addEventListener('click', () => {
    filters.search = ''; filters.build = 'all'; filters.weapon = 'all';
    filters.rarity = 'all'; filters.tier = 'all'; filters.sort = 'tier';
    search.value = '';
    searchClear.hidden = true;
    document.getElementById('filter-build').value  = 'all';
    document.getElementById('filter-weapon').value = 'all';
    document.getElementById('filter-rarity').value = 'all';
    document.getElementById('filter-tier').value   = 'all';
    document.getElementById('sort-by').value        = 'tier';
    populateWeaponFilter();
    applyFilters();
  });
}

function populateWeaponFilter() {
  const select = document.getElementById('filter-weapon');
  const currentVal = select.value;
  select.innerHTML = '<option value="all">All Weapons</option>';

  const weapons = [...new Set(
    allSkins
      .filter(s => filters.build === 'all' || s.build === filters.build)
      .map(s => s.weapon)
  )].sort();

  weapons.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w;
    opt.textContent = w;
    select.appendChild(opt);
  });

  // Restore selection if still valid
  if (weapons.includes(currentVal)) {
    select.value = currentVal;
  } else {
    filters.weapon = 'all';
  }
}

// ── Filter Legend Click ───────────────────────────────────────────────────

function setupLegendFilters() {
  document.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const tier = item.dataset.tier;
      const tierSelect = document.getElementById('filter-tier');
      if (filters.tier === tier) {
        // Toggle off
        filters.tier = 'all';
        tierSelect.value = 'all';
      } else {
        filters.tier = tier;
        tierSelect.value = tier;
      }
      applyFilters();
    });
  });
}

// ── Apply Filters + Sort ──────────────────────────────────────────────────

function applyFilters() {
  const f = filters;

  filteredSkins = allSkins.filter(s => {
    if (f.search) {
      const haystack = `${s.full_name} ${s.weapon}`.toLowerCase();
      if (!haystack.includes(f.search)) return false;
    }
    if (f.build  !== 'all' && s.build  !== f.build)  return false;
    if (f.weapon !== 'all' && s.weapon !== f.weapon)  return false;
    if (f.rarity !== 'all' && s.rarity !== f.rarity)  return false;
    if (f.tier   !== 'all' && s.tier   !== f.tier)    return false;
    return true;
  });

  // Sort
  filteredSkins.sort((a, b) => {
    switch (f.sort) {
      case 'tier':
        return (TIER_ORDER[a.tier]   - TIER_ORDER[b.tier])
            || (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])
            || (b.estimated_value - a.estimated_value);
      case 'value':
        return b.estimated_value - a.estimated_value;
      case 'rarity':
        return (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])
            || (TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
      case 'name':
        return a.full_name.localeCompare(b.full_name);
      case 'weapon':
        return a.weapon.localeCompare(b.weapon) || a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  updateResultCount();
  renderGrid();
}

function updateResultCount() {
  const total    = allSkins.length;
  const filtered = filteredSkins.length;
  const el       = document.getElementById('result-count');
  const resetBtn = document.getElementById('reset-btn');
  const hasFilters = filters.search || filters.build !== 'all' || filters.weapon !== 'all'
    || filters.rarity !== 'all' || filters.tier !== 'all';

  if (el) {
    el.textContent = filtered === total
      ? `${total.toLocaleString()} skins`
      : `${filtered.toLocaleString()} / ${total.toLocaleString()} skins`;
  }
  if (resetBtn) resetBtn.hidden = !hasFilters;
}

// ── Grid Rendering ────────────────────────────────────────────────────────

function renderGrid() {
  const grid      = document.getElementById('skin-grid');
  const noResults = document.getElementById('no-results');
  const loading   = document.getElementById('loading-state');

  if (loading) loading.remove();

  // Disconnect old observer
  if (cardObserver) {
    cardObserver.disconnect();
    cardObserver = null;
  }

  if (filteredSkins.length === 0) {
    grid.innerHTML = '';
    noResults.hidden = false;
    return;
  }
  noResults.hidden = true;

  // Build fragment
  const frag = document.createDocumentFragment();
  filteredSkins.forEach(skin => frag.appendChild(createCard(skin)));

  grid.innerHTML = '';
  grid.appendChild(frag);

  // Scroll-triggered stagger with IntersectionObserver
  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        cardObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -10px 0px' });

  const cards = Array.from(grid.children);
  cards.forEach((card, i) => {
    if (i < 20) {
      // First batch: stagger immediately without observer (above fold)
      setTimeout(() => card.classList.add('visible'), i * 35);
    } else {
      cardObserver.observe(card);
    }
  });
}

// ── Card Creation ─────────────────────────────────────────────────────────

function createCard(skin) {
  const card = document.createElement('div');
  card.className = 'skin-card';

  const tierColor = TIER_COLORS[skin.tier] || '#9e9e9e';
  const tierGlow  = tierColor + '30';
  const tierBorder = tierColor + '60';

  card.style.setProperty('--tier-color',  tierColor);
  card.style.setProperty('--tier-glow',   tierGlow);
  card.style.setProperty('--tier-border', tierBorder);

  const valueStr = skin.estimated_value > 0
    ? `${skin.estimated_value.toLocaleString()} MFC`
    : '—';
  const meta = getCardMeta(skin);

  card.innerHTML = `
    <div class="card-tier-stripe"></div>
    <div class="card-image-wrap" id="img-wrap-${skin.id}">
      <img class="card-img"
           src="${escHtml(skin.image_url || '')}"
           alt="${escHtml(skin.full_name)}"
           loading="lazy"
           decoding="async">
      <div class="card-tier-badge ctb-${skin.tier.toLowerCase()}">${skin.tier}</div>
      ${skin.will_not_return ? '<div class="card-wnr" title="Will Not Return">🔥</div>' : ''}
    </div>
    <div class="card-body">
      <div class="card-weapon">${escHtml(skin.weapon)}</div>
      <div class="card-name">${escHtml(skin.name)}</div>
      <div class="card-meta ${meta.cssClass}">${escHtml(meta.text)}</div>
      <div class="card-footer">
        <span class="rarity-badge rarity-${skin.rarity.toLowerCase()}">${titleCase(skin.rarity)}</span>
        <span class="card-value">${valueStr}</span>
      </div>
    </div>
  `;

  // Image error fallback
  const img = card.querySelector('.card-img');
  img.addEventListener('error', () => {
    const wrap = card.querySelector('.card-image-wrap');
    if (wrap) wrap.classList.add('no-image');
    img.remove();
  });

  card.addEventListener('click', () => openModal(skin));

  return card;
}

// ── Modal ─────────────────────────────────────────────────────────────────

function openModal(skin) {
  activeModal = skin;
  const backdrop = document.getElementById('modal-backdrop');
  const modal    = document.getElementById('modal');

  // Accent color = tier color
  const tierColor = TIER_COLORS[skin.tier] || '#9e9e9e';
  modal.style.setProperty('--modal-accent', tierColor);

  // Image
  const img = document.getElementById('modal-img');
  img.src = skin.image_url || '';
  img.alt = skin.full_name;
  img.onerror = () => { img.style.opacity = '0.2'; };

  // Glow under image matches tier
  const glow = document.getElementById('modal-img-glow');
  if (glow) glow.style.boxShadow = `inset 0 0 60px rgba(0,0,0,0.4), 0 0 40px ${tierColor}20`;

  // Tier pill
  const tierPill = document.getElementById('modal-tier-pill');
  tierPill.textContent = `${skin.tier} — ${TIER_LABELS[skin.tier] || ''}`;
  tierPill.style.background  = tierColor;
  tierPill.style.color       = skin.tier === 'A' || skin.tier === 'B' ? '#fff' : '#000';
  tierPill.style.boxShadow   = `0 0 12px ${tierColor}60`;

  // Rarity pill
  const rarityPill = document.getElementById('modal-rarity-pill');
  rarityPill.textContent = skin.rarity;
  rarityPill.className = `rarity-pill rarity-${skin.rarity.toLowerCase()}`;

  // WNR
  const wnrPill = document.getElementById('modal-wnr-pill');
  wnrPill.hidden = !skin.will_not_return;

  // Names
  document.getElementById('modal-skin-name').textContent  = skin.name;
  document.getElementById('modal-weapon-line').textContent = `${skin.weapon}  ·  ${skin.build}`;
  document.getElementById('modal-build-badge').textContent = skin.build;

  // Value
  const valueNum = document.getElementById('modal-value-num');
  valueNum.textContent = skin.estimated_value > 0
    ? `${skin.estimated_value.toLocaleString()} MFC`
    : 'Unknown';

  // Details
  document.getElementById('md-source').textContent = skin.source || '—';
  document.getElementById('md-build').textContent  = skin.build  || '—';

  const rankedRow = document.getElementById('md-ranked-row');
  if (skin.ranked_tier) {
    rankedRow.hidden = false;
    document.getElementById('md-ranked').textContent = skin.ranked_tier;
  } else {
    rankedRow.hidden = true;
  }

  const costRow = document.getElementById('md-cost-row');
  if (skin.source === 'Store' && skin.cost > 0) {
    costRow.hidden = false;
    document.getElementById('md-cost').textContent = `${skin.cost.toLocaleString()} Multibucks`;
  } else {
    costRow.hidden = true;
  }

  document.getElementById('md-status').textContent = skin.will_not_return
    ? '🔥 Will Not Return'
    : skin.obtainable ? '✓ Obtainable' : '—';

  // Wiki link
  const wikiBtn = document.getElementById('modal-wiki');
  if (skin.cosmetic_url) {
    wikiBtn.href   = skin.cosmetic_url;
    wikiBtn.hidden = false;
  } else {
    wikiBtn.hidden = true;
  }

  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  document.body.style.overflow = '';
  activeModal = null;
}

function setupModalListeners() {
  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeModal) closeModal();
  });
}

// ── Hero Particles ─────────────────────────────────────────────────────────

function createParticles() {
  const container = document.getElementById('hero-particles');
  if (!container) return;

  for (let i = 0; i < 28; i++) {
    const p = document.createElement('span');
    const size = 1 + Math.random() * 2.5;
    p.style.cssText = [
      `left:${Math.random() * 100}%`,
      `animation-delay:${(Math.random() * 9).toFixed(2)}s`,
      `animation-duration:${(5 + Math.random() * 7).toFixed(2)}s`,
      `width:${size.toFixed(1)}px`,
      `height:${size.toFixed(1)}px`,
      `opacity:${(0.3 + Math.random() * 0.65).toFixed(2)}`,
    ].join(';');
    container.appendChild(p);
  }
}

// ── Scroll Listener ────────────────────────────────────────────────────────

function setupScrollListener() {
  const filterBar = document.getElementById('filter-bar');
  if (!filterBar) return;

  const onScroll = () => {
    filterBar.classList.toggle('scrolled', window.scrollY > 60);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}

// ── Utils ─────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function titleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ── Card Metadata ──────────────────────────────────────────────────────────

function getCardMeta(skin) {
  const src = skin.source || '';
  if (src === 'Open Beta' || src === 'Close Beta') {
    return { text: src === 'Open Beta' ? 'Open Beta' : 'Closed Beta', cssClass: 'card-meta--unobtainable' };
  }
  if (src === 'Ranked') {
    const text = skin.ranked_tier ? `${skin.ranked_tier} Ranked` : 'Ranked';
    return { text, cssClass: 'card-meta--ranked' };
  }
  if (src === 'Battle Pass') {
    const text = skin.season ? `${skin.season} Battle Pass` : 'Battle Pass';
    return { text, cssClass: '' };
  }
  if (src === 'Store') {
    const text = skin.cost > 0 ? `Store · ${skin.cost.toLocaleString()} MB` : 'Store';
    return { text, cssClass: '' };
  }
  if (src === 'Twitch Drop') return { text: 'Twitch Drop', cssClass: 'card-meta--twitch' };
  if (src === 'Default')     return { text: 'Default',     cssClass: 'card-meta--muted' };
  return { text: src || '—', cssClass: '' };
}

// ── Page Navigation ────────────────────────────────────────────────────────

let currentView = 'library';

function setupPageNav() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  const views = { library: 'view-library', collection: 'view-collection', converter: 'view-converter' };
  Object.entries(views).forEach(([v, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (v === view) {
      el.removeAttribute('hidden');
      el.style.display = '';
    } else {
      el.setAttribute('hidden', '');
      el.style.display = 'none';
    }
  });
  if (view === 'collection') {
    if (!pickerRendered) {
      applyColFilters();
      pickerRendered = true;
    }
    renderCollectionStats();
  }
  if (view === 'converter' && !converterReady) {
    setupConverter();
    converterReady = true;
  }
}

// ── localStorage Helpers ──────────────────────────────────────────────────

const COLLECTION_KEY = 'tfinals_collection';
let colMemory = [];
let lsAvailable = (() => {
  try { localStorage.setItem('__tf', '1'); localStorage.removeItem('__tf'); return true; }
  catch(e) { return false; }
})();

function colLoad() {
  if (!lsAvailable) return [...colMemory];
  try { return JSON.parse(localStorage.getItem(COLLECTION_KEY) || '[]'); } catch(e) { return []; }
}
function colSave(ids) {
  if (!lsAvailable) { colMemory = [...ids]; return; }
  try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(ids)); } catch(e) {}
}
function colAdd(id)    { const ids = colLoad(); if (!ids.includes(id)) colSave([...ids, id]); }
function colRemove(id) { colSave(colLoad().filter(x => x !== id)); }
function colToggle(id) { colLoad().includes(id) ? colRemove(id) : colAdd(id); }
function colHas(id)    { return colLoad().includes(id); }
function colGetSkins() { const ids = new Set(colLoad()); return allSkins.filter(s => ids.has(s.id)); }
function colClear()    { colSave([]); }

// ── Collection State ──────────────────────────────────────────────────────

const colFilters = { search: '', build: 'all', rarity: 'all', sort: 'tier' };
let pickerRendered = false;
let pickerObserver = null;
let colFilteredSkins = [];

// ── Nav Badge ─────────────────────────────────────────────────────────────

function updateNavCollectionCount() {
  const badge = document.getElementById('nav-collection-count');
  if (!badge) return;
  const count = colLoad().length;
  badge.textContent = count;
  badge.hidden = count === 0;
}

// ── Stats Rendering ───────────────────────────────────────────────────────

function renderCollectionStats() {
  const skins    = colGetSkins();
  const totalVal = skins.reduce((s, k) => s + (k.estimated_value || 0), 0);

  const countEl = document.getElementById('col-total-count');
  const valEl   = document.getElementById('col-total-value');
  if (countEl) countEl.textContent = `${skins.length} skin${skins.length !== 1 ? 's' : ''}`;
  if (valEl)   valEl.textContent   = `${totalVal.toLocaleString()} MFC`;

  renderTierBreakdown(skins);
  renderRarityBreakdown(skins);
  renderBuildBreakdown(skins);
  renderHighlight(skins);
  renderColList(skins);
}

function renderTierBreakdown(skins) {
  const el = document.getElementById('col-tier-breakdown');
  if (!el) return;
  el.innerHTML = ['S','A','B','C','D'].map(tier => {
    const ts    = skins.filter(s => s.tier === tier);
    const count = ts.length;
    const val   = ts.reduce((s, k) => s + (k.estimated_value || 0), 0);
    return `<div class="col-breakdown-row${count === 0 ? ' zero' : ''}">
      <span class="col-brow-label">
        <span class="col-brow-dot" style="background:${TIER_COLORS[tier]}"></span>
        <span>${tier} — ${TIER_LABELS[tier]}</span>
      </span>
      <span class="col-brow-count">${count}</span>
      <span class="col-brow-val">${val > 0 ? val.toLocaleString() + ' MBX' : '—'}</span>
    </div>`;
  }).join('');
}

const RARITY_ARR = ['MYTHIC','LEGENDARY','EPIC','RARE','COMMON'];

function renderRarityBreakdown(skins) {
  const el = document.getElementById('col-rarity-breakdown');
  if (!el) return;
  el.innerHTML = RARITY_ARR.map(rarity => {
    const rs    = skins.filter(s => s.rarity === rarity);
    const count = rs.length;
    const val   = rs.reduce((s, k) => s + (k.estimated_value || 0), 0);
    const label = rarity.charAt(0) + rarity.slice(1).toLowerCase();
    return `<div class="col-breakdown-row${count === 0 ? ' zero' : ''}">
      <span class="col-brow-label">
        <span class="col-brow-dot" style="background:${RARITY_COLORS[rarity]}"></span>
        <span>${label}</span>
      </span>
      <span class="col-brow-count">${count}</span>
      <span class="col-brow-val">${val > 0 ? val.toLocaleString() + ' MBX' : '—'}</span>
    </div>`;
  }).join('');
}

const BUILD_COLORS = { Light: '#4ade80', Medium: '#60a5fa', Heavy: '#f87171' };

function renderBuildBreakdown(skins) {
  const el = document.getElementById('col-build-breakdown');
  if (!el) return;
  el.innerHTML = ['Light','Medium','Heavy'].map(build => {
    const count = skins.filter(s => s.build === build).length;
    return `<div class="col-breakdown-row${count === 0 ? ' zero' : ''}">
      <span class="col-brow-label">
        <span class="col-brow-dot" style="background:${BUILD_COLORS[build]}"></span>
        <span>${build}</span>
      </span>
      <span class="col-brow-count">${count}</span>
      <span class="col-brow-val"></span>
    </div>`;
  }).join('');
}

function renderHighlight(skins) {
  const box = document.getElementById('col-highlight');
  if (!box) return;
  if (skins.length === 0) { box.hidden = true; return; }
  const best = skins.reduce((a, b) => b.estimated_value > a.estimated_value ? b : a);
  box.hidden = false;
  document.getElementById('col-highlight-name').textContent = best.full_name;
  document.getElementById('col-highlight-val').textContent  = `${(best.estimated_value || 0).toLocaleString()} MFC`;
}

function renderColList(skins) {
  const el = document.getElementById('col-skin-list');
  if (!el) return;
  if (skins.length === 0) {
    el.innerHTML = `<div class="col-list-empty">No skins selected yet.<br>Browse the picker and click to add.</div>`;
    return;
  }
  const sorted = [...skins].sort((a, b) =>
    (TIER_ORDER[a.tier] - TIER_ORDER[b.tier]) || (b.estimated_value - a.estimated_value)
  );
  el.innerHTML = sorted.map(skin => `
    <div class="col-list-row">
      <img class="col-list-thumb" src="${escHtml(skin.image_url || '')}" alt="" loading="lazy" onerror="this.style.opacity='0.15'">
      <div class="col-list-info">
        <div class="col-list-name">${escHtml(skin.name)}</div>
        <div class="col-list-sub">${escHtml(skin.weapon)} <span class="rarity-badge rarity-${skin.rarity.toLowerCase()}">${titleCase(skin.rarity)}</span></div>
      </div>
      <span class="col-list-val">${skin.estimated_value > 0 ? skin.estimated_value.toLocaleString() + ' MBX' : '—'}</span>
      <button class="col-list-remove" data-id="${escHtml(skin.id)}" title="Remove">✕</button>
    </div>
  `).join('');

  el.querySelectorAll('.col-list-remove').forEach(btn => {
    btn.addEventListener('click', () => { colRemove(btn.dataset.id); refreshCollectionUI(); });
  });
}

function refreshCollectionUI() {
  updateNavCollectionCount();
  if (currentView === 'collection') {
    renderCollectionStats();
    renderPickerGrid();
  }
}

// ── Collection Picker Filters ─────────────────────────────────────────────

function setupColFilters() {
  const searchEl = document.getElementById('col-search');
  const clearEl  = document.getElementById('col-search-clear');
  if (!searchEl) return;

  searchEl.addEventListener('input', debounce(e => {
    colFilters.search = e.target.value.trim().toLowerCase();
    clearEl.hidden = !colFilters.search;
    if (pickerRendered) applyColFilters();
  }, 140));

  clearEl.addEventListener('click', () => {
    searchEl.value = ''; colFilters.search = ''; clearEl.hidden = true;
    if (pickerRendered) applyColFilters();
  });

  [['col-filter-build','build'],['col-filter-rarity','rarity'],['col-sort','sort']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', e => {
      colFilters[key] = e.target.value;
      if (pickerRendered) applyColFilters();
    });
  });
}

function setupCollectionActions() {
  const csvBtn   = document.getElementById('btn-export-csv');
  const copyBtn  = document.getElementById('btn-copy-text');
  const clearBtn = document.getElementById('btn-clear-col');
  if (csvBtn)   csvBtn.addEventListener('click', exportCSV);
  if (copyBtn)  copyBtn.addEventListener('click', copyCollectionText);
  if (clearBtn) clearBtn.addEventListener('click', clearCollection);
}

function applyColFilters() {
  const f = colFilters;
  colFilteredSkins = allSkins.filter(s => {
    if (f.search && !`${s.full_name} ${s.weapon}`.toLowerCase().includes(f.search)) return false;
    if (f.build  !== 'all' && s.build  !== f.build)  return false;
    if (f.rarity !== 'all' && s.rarity !== f.rarity)  return false;
    return true;
  });

  colFilteredSkins.sort((a, b) => {
    switch (f.sort) {
      case 'value': return b.estimated_value - a.estimated_value;
      case 'name':  return a.full_name.localeCompare(b.full_name);
      default:
        return (TIER_ORDER[a.tier] - TIER_ORDER[b.tier])
            || (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])
            || (b.estimated_value - a.estimated_value);
    }
  });

  const countEl = document.getElementById('col-picker-count');
  if (countEl) countEl.textContent = `${colFilteredSkins.length.toLocaleString()} skins`;
  renderPickerGrid();
}

// ── Picker Grid ───────────────────────────────────────────────────────────

function renderPickerGrid() {
  const grid = document.getElementById('col-picker-grid');
  if (!grid) return;

  if (pickerObserver) { pickerObserver.disconnect(); pickerObserver = null; }

  const frag = document.createDocumentFragment();
  colFilteredSkins.forEach(skin => frag.appendChild(createPickerCard(skin)));
  grid.innerHTML = '';
  grid.appendChild(frag);

  pickerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); pickerObserver.unobserve(entry.target); }
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -10px 0px' });

  Array.from(grid.children).forEach((card, i) => {
    if (i < 30) setTimeout(() => card.classList.add('visible'), i * 20);
    else pickerObserver.observe(card);
  });
}

function createPickerCard(skin) {
  const card     = document.createElement('div');
  const selected = colHas(skin.id);
  card.className = `picker-card${selected ? ' picker-card--selected' : ''}`;

  const tierColor = TIER_COLORS[skin.tier] || '#9e9e9e';
  card.style.setProperty('--tier-color',  tierColor);
  card.style.setProperty('--tier-glow',   tierColor + '30');
  card.style.setProperty('--tier-border', tierColor + '60');

  card.innerHTML = `
    <div class="card-tier-stripe"></div>
    <div class="card-image-wrap">
      <img class="card-img" src="${escHtml(skin.image_url || '')}" alt="${escHtml(skin.full_name)}" loading="lazy" decoding="async">
      <div class="card-tier-badge ctb-${skin.tier.toLowerCase()}">${skin.tier}</div>
      ${skin.will_not_return ? '<div class="card-wnr" title="Will Not Return">🔥</div>' : ''}
      <div class="picker-check">✓</div>
    </div>
    <div class="card-body">
      <div class="card-weapon">${escHtml(skin.weapon)}</div>
      <div class="card-name">${escHtml(skin.name)}</div>
      <div class="card-footer">
        <span class="rarity-badge rarity-${skin.rarity.toLowerCase()}">${titleCase(skin.rarity)}</span>
        <span class="card-value">${skin.estimated_value > 0 ? skin.estimated_value.toLocaleString() + ' MBX' : '—'}</span>
      </div>
    </div>
  `;

  card.querySelector('.card-img').addEventListener('error', function() {
    const wrap = card.querySelector('.card-image-wrap');
    if (wrap) wrap.classList.add('no-image');
    this.remove();
  });

  card.addEventListener('click', () => { colToggle(skin.id); refreshCollectionUI(); });
  return card;
}

// ── Export ────────────────────────────────────────────────────────────────

function exportCSV() {
  const skins = colGetSkins();
  if (skins.length === 0) { alert('No skins in your collection yet!'); return; }

  const headers = ['Name','Weapon','Build','Rarity','Tier','Tier Label','Est. Value (MBX)','Source','Season','Will Not Return'];
  const rows = skins.map(s => [
    s.full_name, s.weapon, s.build, s.rarity, s.tier,
    s.tier_label || TIER_LABELS[s.tier] || '',
    s.estimated_value || 0,
    s.source || '', s.season || '',
    s.will_not_return ? 'true' : 'false',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `my-finals-collection-${date}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

function copyCollectionText() {
  const skins = colGetSkins();
  if (skins.length === 0) { alert('No skins in your collection yet!'); return; }

  const sorted   = [...skins].sort((a, b) =>
    (TIER_ORDER[a.tier] - TIER_ORDER[b.tier]) || (b.estimated_value - a.estimated_value)
  );
  const totalVal = skins.reduce((s, k) => s + (k.estimated_value || 0), 0);

  const tc = {}, bc = {};
  sorted.forEach(s => { tc[s.tier] = (tc[s.tier] || 0) + 1; bc[s.build] = (bc[s.build] || 0) + 1; });

  const tierLine  = ['S','A','B','C','D'].filter(t => tc[t]).map(t => `${t}: ${tc[t]}`).join('  ');
  const buildLine = ['Light','Medium','Heavy'].filter(b => bc[b]).map(b => `${b}: ${bc[b]}`).join('  ');

  const text = [
    `My Finals Collection — ${skins.length} skin${skins.length !== 1 ? 's' : ''} · ${totalVal.toLocaleString()} MFC`,
    '══════════════════════════════════════════════',
    ...sorted.map(s => `[${s.tier}] ${s.full_name} · ${s.weapon} · ${s.rarity} · ~${(s.estimated_value || 0).toLocaleString()} MFC`),
    '──────────────────────────────────────────────',
    tierLine,
    buildLine,
    'Generated by The Finals Skin Library',
  ].join('\n');

  const btn  = document.getElementById('btn-copy-text');
  const done = () => { if (btn) { const o = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = o, 2000); } };

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, cb) {
  const ta = Object.assign(document.createElement('textarea'), {
    value: text, style: 'position:fixed;opacity:0',
  });
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  cb();
}

function clearCollection() {
  const count = colLoad().length;
  if (count === 0) return;
  if (!confirm(`Remove all ${count} skin${count !== 1 ? 's' : ''} from your collection?`)) return;
  colClear();
  refreshCollectionUI();
}

// ── Multibucks Converter ──────────────────────────────────────────────────

let converterReady = false;

// Base: 500 MBX = 4.99 EUR
const MBX_EUR_RATE = 4.99 / 500; // EUR per 1 MBX

const CURRENCIES = [
  { code: 'EUR', symbol: '€',    name: 'Euro',               rate: 1.000  },
  { code: 'USD', symbol: '$',    name: 'US Dollar',           rate: 1.090  },
  { code: 'GBP', symbol: '£',    name: 'British Pound',       rate: 0.850  },
  { code: 'CHF', symbol: 'Fr',   name: 'Swiss Franc',         rate: 0.940  },
  { code: 'CAD', symbol: 'CA$',  name: 'Canadian Dollar',     rate: 1.570  },
  { code: 'AUD', symbol: 'AU$',  name: 'Australian Dollar',   rate: 1.780  },
  { code: 'SEK', symbol: 'kr',   name: 'Swedish Krona',       rate: 11.200 },
  { code: 'NOK', symbol: 'kr',   name: 'Norwegian Krone',     rate: 11.750 },
  { code: 'DKK', symbol: 'kr',   name: 'Danish Krone',        rate: 7.460  },
  { code: 'PLN', symbol: 'zł',   name: 'Polish Zloty',        rate: 4.270  },
  { code: 'CZK', symbol: 'Kč',   name: 'Czech Koruna',        rate: 25.200 },
  { code: 'HUF', symbol: 'Ft',   name: 'Hungarian Forint',    rate: 400.0  },
  { code: 'JPY', symbol: '¥',    name: 'Japanese Yen',        rate: 162.0  },
  { code: 'CNY', symbol: '¥',    name: 'Chinese Yuan',        rate: 7.930  },
  { code: 'KRW', symbol: '₩',    name: 'South Korean Won',    rate: 1580.0 },
  { code: 'SGD', symbol: 'S$',   name: 'Singapore Dollar',    rate: 1.470  },
  { code: 'BRL', symbol: 'R$',   name: 'Brazilian Real',      rate: 6.500  },
  { code: 'MXN', symbol: 'MX$',  name: 'Mexican Peso',        rate: 23.000 },
  { code: 'ARS', symbol: '$',    name: 'Argentine Peso',      rate: 1100.0 },
  { code: 'INR', symbol: '₹',    name: 'Indian Rupee',        rate: 91.0   },
  { code: 'TRY', symbol: '₺',    name: 'Turkish Lira',        rate: 38.0   },
];

const MBX_PACKS = [500, 1000, 2000, 5000, 11000];

function setupConverter() {
  const sel = document.getElementById('conv-currency');
  if (!sel) return;

  CURRENCIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = `${c.code} (${c.symbol}) — ${c.name}`;
    sel.appendChild(opt);
  });

  const mbxInput   = document.getElementById('conv-mbx');
  const moneyInput = document.getElementById('conv-money');

  mbxInput.addEventListener('input', () => {
    const mbx = parseFloat(mbxInput.value);
    const cur  = activeCurrency();
    if (!isNaN(mbx) && mbx >= 0) {
      moneyInput.value = (mbx * MBX_EUR_RATE * cur.rate).toFixed(decimalsFor(cur));
    } else {
      moneyInput.value = '';
    }
    updateRateNote(cur);
  });

  moneyInput.addEventListener('input', () => {
    const money = parseFloat(moneyInput.value);
    const cur   = activeCurrency();
    if (!isNaN(money) && money >= 0) {
      mbxInput.value = Math.round(money / (MBX_EUR_RATE * cur.rate));
    } else {
      mbxInput.value = '';
    }
    updateRateNote(cur);
  });

  sel.addEventListener('change', () => {
    const cur = activeCurrency();
    document.getElementById('conv-symbol').textContent = cur.symbol;
    // Recalculate from MBX side if filled
    const mbx = parseFloat(mbxInput.value);
    if (!isNaN(mbx) && mbx >= 0) {
      moneyInput.value = (mbx * MBX_EUR_RATE * cur.rate).toFixed(decimalsFor(cur));
    }
    updateRateNote(cur);
    renderPacks(cur);
  });

  // Initial render
  const cur = activeCurrency();
  document.getElementById('conv-symbol').textContent = cur.symbol;
  updateRateNote(cur);
  renderPacks(cur);
  renderAllCurrencies();
}

function activeCurrency() {
  const code = document.getElementById('conv-currency').value;
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}

function decimalsFor(cur) {
  return cur.rate >= 100 ? 0 : 2;
}

function fmtPrice(value, cur) {
  return `${cur.symbol} ${value.toFixed(decimalsFor(cur))}`;
}

function updateRateNote(cur) {
  const el = document.getElementById('conv-rate-note');
  if (!el) return;
  const price = (500 * MBX_EUR_RATE * cur.rate).toFixed(decimalsFor(cur));
  el.textContent = `1 MBX ≈ ${cur.symbol} ${(MBX_EUR_RATE * cur.rate).toFixed(decimalsFor(cur) + 2)}  ·  500 MBX = ${cur.symbol} ${price}`;
}

function renderPacks(cur) {
  const grid = document.getElementById('conv-packs-grid');
  if (!grid) return;
  grid.innerHTML = MBX_PACKS.map(pack => {
    const price = pack * MBX_EUR_RATE * cur.rate;
    return `<div class="pack-card">
      <div class="pack-mbx">${pack.toLocaleString()} <span class="pack-unit">MBX</span></div>
      <div class="pack-price">${fmtPrice(price, cur)}</div>
    </div>`;
  }).join('');
}

function renderAllCurrencies() {
  const el = document.getElementById('conv-all-table');
  if (!el) return;
  el.innerHTML = CURRENCIES.map(cur => {
    const price = 500 * MBX_EUR_RATE * cur.rate;
    return `<div class="conv-currency-row">
      <span class="conv-currency-code">${cur.code}</span>
      <span class="conv-currency-name">${cur.name}</span>
      <span class="conv-currency-price">${fmtPrice(price, cur)}</span>
    </div>`;
  }).join('');
}
