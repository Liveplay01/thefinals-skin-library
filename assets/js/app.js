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

  try {
    await loadData();
    setupFilters();
    applyFilters();
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
