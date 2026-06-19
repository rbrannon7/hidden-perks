// Admin mode: run  localStorage.setItem('hp_admin', '1')  in the browser console to enable
const IS_ADMIN = localStorage.getItem('hp_admin') === '1';

// === DOM refs ===
const resultsList = document.getElementById('resultsList');
const resultCount = document.getElementById('resultCount');
const searchForm = document.getElementById('searchForm');
const queryInput = document.getElementById('queryInput');
const categoryFilter = document.getElementById('categoryFilter');
const zipInput = document.getElementById('zipInput');
const askModal = document.getElementById('askModal');
const askScript = document.getElementById('askScript');
const showMode = document.getElementById('showMode');
const showScript = document.getElementById('showScript');
const submitForm = document.getElementById('submitForm');
const submitStatus = document.getElementById('submitStatus');

// === Helpers ===
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Conditions text can mark promo codes with **double asterisks** so they stand out.
function stripBold(s) {
  return String(s == null ? '' : s).replace(/\*\*(.+?)\*\*/g, '$1');
}

function formatConditions(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function buildScript(name, discount, ageReq, conditions) {
  const age = ageReq ? `${ageReq}+` : 'Ask at location';
  const lines = [
    `${name} — Senior Discount`,
    ``,
    `Discount: ${discount || 'Ask at the register'}`,
    `Age Required: ${age}`,
    `Conditions: ${stripBold(conditions) || 'Ask at the register for current terms'}`,
  ];
  return lines.join('\n');
}

// === Render result cards ===
function renderResults(results, locationLabel = '') {
  resultCount.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;

  const banner = document.getElementById('locationBanner');
  if (banner) {
    if (locationLabel) {
      banner.textContent = locationLabel;
      banner.hidden = false;
      banner.className = locationLabel.startsWith('📍')
        ? 'location-banner location-banner--found'
        : 'location-banner location-banner--fallback';
    } else {
      banner.hidden = true;
    }
  }

  if (!results.length) {
    resultsList.innerHTML = `
      <article class="result-card">
        <h3>No results found</h3>
        <p class="result-meta">Try a business name like Denny's, Kohl's, CVS, or choose a category above.</p>
      </article>`;
    return;
  }

  // Featured sponsors always appear first
  results.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  resultsList.innerHTML = results.map((item) => {
    const conditions = item.conditions || 'Ask at the register for current terms';
    const officialUrl = item.sourceUrl
      ? item.sourceUrl
      : `https://www.google.com/search?q=${encodeURIComponent(item.name + ' senior discount')}`;

    const ageBadge = item.ageRequirement
      ? `<span class="age-badge">${item.ageRequirement}+</span>`
      : '';

    const featuredBadge = item.featured
      ? `<span class="featured-badge"><span class="featured-star">★</span> Featured</span>`
      : '';

    const localBadge = item.source === 'local'
      ? `<span class="local-badge">Local</span>`
      : item.subcategory === 'national' && item.category === 'parks'
        ? `<span class="national-park-badge">🏔️ National Park</span>`
        : item.subcategory === 'state' && item.category === 'parks'
          ? `<span class="state-park-badge">🌲 State Park</span>`
          : item.source === 'nearby'
            ? `<span class="nearby-badge">📍 Near You</span>`
            : '';

    const verifiedLine = item.lastVerified
      ? `<p class="last-verified">✓ Verified ${esc(item.lastVerified)}</p>`
      : '';

    const adminBtn = IS_ADMIN
      ? `<button type="button" class="btn-admin-fetch" data-id="${esc(item.id)}" data-url="${esc(item.sourceUrl || '')}" data-name="${esc(item.name)}">↺ Fetch Details</button>`
      : '';

    const cityStateZip = [[item.city, item.state].filter(Boolean).join(', '), item.zip].filter(Boolean).join(' ');
    const fullLocation = [item.address, cityStateZip].filter(Boolean).join(', ');

    return `
      <article class="result-card${item.featured ? ' result-card--featured' : ''}" id="card-${esc(item.id)}">
        <div class="card-header">
          <h3>${esc(item.name)}</h3>
          ${ageBadge}
          ${featuredBadge}
          ${localBadge}
        </div>
        ${fullLocation ? `<p class="card-address">📍 ${esc(fullLocation)}</p>` : `<p class="card-tagline">Ask for this discount when you make a purchase.</p>`}
        <div class="detail-box">
          <p class="detail-label"><b>Discount Details</b></p>
          <p class="detail-value">${esc(item.discount || 'Ask at the register')}</p>
        </div>
        <div class="detail-box">
          <p class="detail-label"><b>Conditions</b></p>
          <p class="detail-value">${formatConditions(conditions)}</p>
        </div>
        ${verifiedLine}
        <div id="admin-preview-${esc(item.id)}" class="admin-preview" hidden></div>
        <div class="result-actions">
          <button type="button" class="btn-ask"
            data-name="${esc(item.name)}"
            data-discount="${esc(item.discount || '')}"
            data-age="${esc(String(item.ageRequirement || ''))}"
            data-conditions="${esc(conditions)}">Share Discount</button>
          ${adminBtn}
        </div>
      </article>`;
  }).join('');

  document.querySelectorAll('.btn-ask').forEach((btn) => {
    btn.addEventListener('click', () => openAskModal(btn.dataset.name, btn.dataset.discount, btn.dataset.age, btn.dataset.conditions));
  });

  if (IS_ADMIN) {
    document.querySelectorAll('.btn-admin-fetch').forEach((btn) => {
      btn.addEventListener('click', () => fetchAdminDetails(btn.dataset.id, btn.dataset.url, btn.dataset.name));
    });
  }
}

// === Ask For Me modal ===
function openAskModal(name, discount, ageReq, conditions) {
  askScript.textContent = buildScript(name, discount, ageReq, conditions);
  askModal.hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('closeAsk').focus();
}

function closeAskModal() {
  askModal.hidden = true;
  document.body.style.overflow = '';
}

document.getElementById('closeAsk').addEventListener('click', closeAskModal);

askModal.addEventListener('click', (e) => {
  if (e.target === askModal) closeAskModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!showMode.hidden) { showMode.hidden = true; return; }
    if (!askModal.hidden) { closeAskModal(); }
  }
});

document.getElementById('btnShow').addEventListener('click', () => {
  showScript.textContent = askScript.textContent;
  askModal.hidden = true;
  showMode.hidden = false;
  document.getElementById('closeShow').focus();
});

document.getElementById('closeShow').addEventListener('click', () => {
  showMode.hidden = true;
});

document.getElementById('btnCopy').addEventListener('click', () => {
  navigator.clipboard.writeText(askScript.textContent).then(() => {
    const btn = document.getElementById('btnCopy');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
});

document.getElementById('btnText').addEventListener('click', () => {
  window.location.href = `sms:?body=${encodeURIComponent(askScript.textContent)}`;
});

// === Admin: fetch details via Claude API ===
async function fetchAdminDetails(id, url, name) {
  const preview = document.getElementById(`admin-preview-${id}`);
  if (!preview) return;

  preview.hidden = false;
  preview.innerHTML = '<p class="result-meta">Fetching details via Claude AI...</p>';

  try {
    const resp = await fetch('/api/admin/fetch-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: id, url, businessName: name }),
    });
    const data = await resp.json();

    if (!data.ok) {
      preview.innerHTML = `<p class="admin-error">Error: ${esc(data.error)}</p>`;
      return;
    }

    const { discount, ageRequirement, conditions } = data.extracted;
    preview.innerHTML = `
      <p class="admin-preview-header">AI-Extracted — copy to national-chains.json to save</p>
      <p class="detail-label">Discount</p>
      <p class="detail-value">${esc(discount || 'n/a')}</p>
      <p class="detail-label">Age Requirement</p>
      <p class="detail-value">${esc(ageRequirement ?? 'unknown')}</p>
      <p class="detail-label">Conditions</p>
      <p class="detail-value">${esc(conditions || 'n/a')}</p>`;
  } catch (err) {
    preview.innerHTML = `<p class="admin-error">Network error: ${esc(err.message)}</p>`;
  }
}

// === Search ===
function fetchResults(query, category = '', zip = '') {
  const params = new URLSearchParams({ q: query });
  if (category) params.set('category', category);
  if (zip) params.set('zip', zip);

  const baseSearch = fetch(`/api/search?${params}`)
    .then((r) => r.json())
    .catch(() => ({ results: [] }));

  // National Parks and Online Businesses are nationwide and never depend on ZIP — no need to hit /api/nearby
  const nearbySearch = zip.length === 5 && category !== 'national-parks' && category !== 'online'
    ? fetch(`/api/nearby?${new URLSearchParams({ zip, ...(category && { category }), ...(query && { q: query }) })}`)
        .then((r) => r.json())
        .catch(() => null)
    : Promise.resolve(null);

  Promise.all([baseSearch, nearbySearch])
    .then(([searchData, nearbyData]) => {
      let results = searchData.results || [];
      let locationLabel = '';

      if (category === 'national-parks') {
        locationLabel = '🏔️ Showing all National Parks nationwide';
      } else if (category === 'online') {
        locationLabel = '💻 Showing all Online Businesses nationwide';
      } else if (category === 'state-parks') {
        if (nearbyData?.ok && nearbyData.results?.length) {
          results = nearbyData.results;
          const stateName = nearbyData.state || '';
          locationLabel = `🌲 Showing all ${stateName} State Parks`;
        } else if (nearbyData?.ok) {
          // ZIP resolved to a state fine, but no park there matched the typed name
          results = [];
          const stateName = nearbyData.state || 'this state';
          locationLabel = query
            ? `No state parks matching "${query}" found in ${stateName}`
            : `No state parks found for ${stateName}`;
        } else if (zip.length === 5) {
          results = [];
          locationLabel = `Couldn't find state parks for ZIP ${zip} — double-check the ZIP and try again`;
        } else {
          // No ZIP entered — show all state parks nationwide (already sorted by state)
          locationLabel = '🌲 Showing all State Parks nationwide — enter a ZIP to narrow to your state';
        }
      } else if (nearbyData?.ok && nearbyData.results?.length) {
        // ZIP search worked — show only nearby locations + local submissions for that ZIP
        const localResults = results.filter((r) => r.source === 'local');
        results = [...nearbyData.results, ...localResults];
        const city = nearbyData.city ? `${nearbyData.city} ` : '';
        locationLabel = `📍 Showing locations near ${city}ZIP ${nearbyData.zip}`;
      } else if (nearbyData?.ok) {
        // Places lookup worked but couldn't confirm a nearby location (e.g. Google
        // Places didn't index it, or there isn't one near this ZIP) — fall back to
        // the national chain / local entries already matched by name and category,
        // rather than discarding them.
        const city = nearbyData.city ? `${nearbyData.city} ` : '';
        locationLabel = query
          ? `Couldn't confirm a nearby location for "${query}" near ${city}ZIP ${zip} — showing general discount info`
          : `No specific nearby matches found for ZIP ${zip} — showing all national chains`;
      } else if (zip.length === 5) {
        // ZIP entered but Places API unavailable — show all national chains
        locationLabel = `Showing all national chains — location search unavailable for ZIP ${zip}`;
      }

      renderResults(results, locationLabel);
    })
    .catch(() => {
      resultsList.innerHTML = `
        <article class="result-card">
          <h3>Search unavailable</h3>
          <p class="result-meta">Make sure the server is running with npm start, then try again.</p>
        </article>`;
    });
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  fetchResults(queryInput.value.trim(), categoryFilter.value, zipInput.value.trim());
});

// Initial load — show all
fetchResults('');

// === Submission form ===
function showSubmitStatus(type, message) {
  submitStatus.hidden = false;
  submitStatus.className = `submit-status submit-status--${type}`;
  submitStatus.textContent = message;
}

submitForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('submitName').value.trim();
  const discount = document.getElementById('submitDiscount').value.trim();

  if (!name) { showSubmitStatus('error', 'Please enter the business name.'); return; }
  if (!discount) { showSubmitStatus('error', 'Please describe the senior discount.'); return; }

  const payload = {
    name,
    city: document.getElementById('submitCity').value.trim(),
    state: document.getElementById('submitState').value.trim(),
    zip: document.getElementById('submitZip').value.trim(),
    category: document.getElementById('submitCategory').value,
    discount,
    ageRequirement: parseInt(document.getElementById('submitAge').value) || null,
    conditions: document.getElementById('submitConditions').value.trim(),
    submittedBy: document.getElementById('submitEmail').value.trim(),
  };

  const btn = submitForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.ok) {
      showSubmitStatus('success', 'Thank you! Your submission is under review and will appear once verified.');
      submitForm.reset();
    } else {
      showSubmitStatus('error', data.error || 'Submission failed. Please try again.');
    }
  } catch {
    showSubmitStatus('error', 'Network error. Please check your connection and try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit This Discount';
  }
});

// === PWA install prompt ===
let deferredInstall = null;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const installDismiss = document.getElementById('installDismiss');
const installText = document.getElementById('installText');

// Already running as an installed app (standalone) — never show the banner
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

if (installBanner && !isStandalone) {
  if (isIOS) {
    // iOS Safari never fires beforeinstallprompt — show manual instructions instead of a button
    installText.textContent = 'Tap the Share icon below, then "Add to Home Screen" for one-tap access.';
    installBtn.hidden = true;
    installBanner.hidden = false;
  } else {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstall = e;
      installBanner.hidden = false;
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      installBanner.hidden = true;
    });
  }

  installDismiss.addEventListener('click', () => {
    installBanner.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    installBanner.hidden = true;
    deferredInstall = null;
  });
}

