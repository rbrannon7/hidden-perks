// Admin mode: run  localStorage.setItem('hp_admin', '1')  in the browser console to enable
const IS_ADMIN = localStorage.getItem('hp_admin') === '1';

// === DOM refs ===
const resultsList = document.getElementById('resultsList');
const alsoNearbySection = document.getElementById('alsoNearbySection');
const alsoNearbyList = document.getElementById('alsoNearbyList');
const alsoNearbyHeading = document.getElementById('alsoNearbyHeading');
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
    `Note: Terms may vary — please confirm with staff.`,
  ];
  return lines.join('\n');
}

// Structured markup for the full-screen cashier view — same info as buildScript(),
// laid out as labeled fields instead of a run-on paragraph so it reads at a glance.
function buildShowHTML(name, discount, ageReq, conditions) {
  const age = ageReq ? `${ageReq}+` : 'Ask at location';
  return `
    <h3 class="show-name">${esc(name)}</h3>
    <p class="show-tag">Senior Discount</p>
    <dl class="show-fields">
      <div class="show-field">
        <dt>Discount</dt>
        <dd>${esc(discount || 'Ask at the register')}</dd>
      </div>
      <div class="show-field">
        <dt>Age Required</dt>
        <dd>${esc(age)}</dd>
      </div>
      <div class="show-field">
        <dt>Conditions</dt>
        <dd>${formatConditions(conditions || 'Ask at the register for current terms')}</dd>
      </div>
    </dl>
    <p class="show-disclaimer">Terms may vary — please confirm with staff.</p>
  `;
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
    renderAlsoNearby([]);
    return;
  }

  // Featured sponsors always appear first
  results.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  resultsList.innerHTML = results.map(buildResultCardHTML).join('');
  bindCardEvents(resultsList);
}

// Builds the HTML for a single result card. Shared by the main results grid
// and the "Also Available in Your State" callout so both stay visually and
// behaviorally identical.
function buildResultCardHTML(item) {
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
        : item.category === 'education'
          ? `<span class="education-badge">🎓 Education</span>`
          : item.category === 'ski-resorts'
            ? `<span class="ski-resort-badge">❄️ Ski Resort</span>`
            : item.source === 'nearby'
              ? `<span class="nearby-badge">📍 Near You</span>`
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
      ${fullLocation ? `<p class="card-address">📍 ${esc(fullLocation)}</p>` : ''}
      <div class="detail-box">
        <p class="detail-label"><b>Discount Details</b></p>
        <p class="detail-value">${esc(item.discount || 'Ask at the register')}</p>
      </div>
      <div class="detail-box">
        <p class="detail-label"><b>Conditions</b></p>
        <p class="detail-value">${formatConditions(conditions)}</p>
      </div>
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
}

// Binds Share Discount / admin Fetch Details handlers for cards within a
// specific container, scoped so re-rendering one section never re-binds
// (and double-fires) listeners already attached in another section.
function bindCardEvents(container) {
  container.querySelectorAll('.btn-ask').forEach((btn) => {
    btn.addEventListener('click', () => openAskModal(btn.dataset.name, btn.dataset.discount, btn.dataset.age, btn.dataset.conditions));
  });

  if (IS_ADMIN) {
    container.querySelectorAll('.btn-admin-fetch').forEach((btn) => {
      btn.addEventListener('click', () => fetchAdminDetails(btn.dataset.id, btn.dataset.url, btn.dataset.name));
    });
  }
}

// === "Also Available in Your State" callout ===
// Shown only for a plain ZIP search (no category picked) — folds in that
// state's Education and State Park entries alongside the main nearby-business
// results, without mixing them indistinguishably into the same list.
function renderAlsoNearby(items, stateCode = '') {
  if (!alsoNearbySection || !alsoNearbyList) return;

  if (!items.length) {
    alsoNearbySection.hidden = true;
    alsoNearbyList.innerHTML = '';
    return;
  }

  if (alsoNearbyHeading) {
    alsoNearbyHeading.textContent = stateCode
      ? `📚 Also Available in ${stateCode}`
      : '📚 Also Available in Your State';
  }
  alsoNearbyList.innerHTML = items.map(buildResultCardHTML).join('');
  bindCardEvents(alsoNearbyList);
  alsoNearbySection.hidden = false;
}

// === Ask For Me modal ===
let currentAsk = null;

function openAskModal(name, discount, ageReq, conditions) {
  currentAsk = { name, discount, ageReq, conditions };
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
    if (!showMode.hidden) { closeShowMode(); return; }
    if (!askModal.hidden) { closeAskModal(); }
  }
});

document.getElementById('btnShow').addEventListener('click', () => {
  showScript.innerHTML = buildShowHTML(currentAsk.name, currentAsk.discount, currentAsk.ageReq, currentAsk.conditions);
  askModal.hidden = true;
  showMode.hidden = false;
  document.getElementById('closeShow').focus();
});

function closeShowMode() {
  showMode.hidden = true;
  document.body.style.overflow = '';
}

document.getElementById('closeShow').addEventListener('click', closeShowMode);

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

  // "Also Available in Your State" callout: only for a plain ZIP search with
  // no category picked — Education and State Park entries are statewide
  // programs, not physical places, so they'd never surface from the generic
  // nearby-business lookup above. Fetching their own category-specific
  // /api/nearby (same endpoint State Parks/Education already use when picked
  // directly) reuses the existing state-matching logic and server cache.
  const showCallout = !category && zip.length === 5;
  const calloutSearch = showCallout
    ? Promise.all([
        fetch(`/api/nearby?${new URLSearchParams({ zip, category: 'education' })}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/nearby?${new URLSearchParams({ zip, category: 'state-parks' })}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/nearby?${new URLSearchParams({ zip, category: 'ski-resorts' })}`).then((r) => r.json()).catch(() => null),
      ])
    : Promise.resolve([null, null, null]);

  Promise.all([baseSearch, nearbySearch, calloutSearch])
    .then(([searchData, nearbyData, [eduData, parkData, resortData]]) => {
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
      } else if (category === 'education') {
        if (nearbyData?.ok && nearbyData.results?.length) {
          results = nearbyData.results;
          const stateName = nearbyData.state || '';
          locationLabel = `🎓 Showing senior education discounts for ${stateName}`;
        } else if (nearbyData?.ok) {
          // ZIP resolved to a state fine, but no education discount there yet
          results = [];
          const stateName = nearbyData.state || 'this state';
          locationLabel = query
            ? `No education discounts matching "${query}" found for ${stateName}`
            : `No senior education discounts found for ${stateName} yet`;
        } else if (zip.length === 5) {
          results = [];
          locationLabel = `Couldn't find education discounts for ZIP ${zip} — double-check the ZIP and try again`;
        } else {
          // No ZIP entered — show all education discounts nationwide
          locationLabel = '🎓 Showing all Education discounts nationwide — enter a ZIP to narrow to your state';
        }
      } else if (category === 'ski-resorts') {
        if (nearbyData?.ok && nearbyData.results?.length) {
          results = nearbyData.results;
          const stateName = nearbyData.state || '';
          locationLabel = `❄️ Showing senior ski resort discounts for ${stateName}`;
        } else if (nearbyData?.ok) {
          // ZIP resolved to a state fine, but no ski resort discount there yet
          results = [];
          const stateName = nearbyData.state || 'this state';
          locationLabel = query
            ? `No ski resort discounts matching "${query}" found for ${stateName}`
            : `No senior ski resort discounts found for ${stateName} yet`;
        } else if (zip.length === 5) {
          results = [];
          locationLabel = `Couldn't find ski resort discounts for ZIP ${zip} — double-check the ZIP and try again`;
        } else {
          // No ZIP entered — show all ski resort discounts nationwide
          locationLabel = '❄️ Showing all Ski Resort discounts nationwide — enter a ZIP to narrow to your state';
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

      const calloutItems = [
        ...(eduData?.ok ? eduData.results || [] : []),
        ...(parkData?.ok ? parkData.results || [] : []),
        ...(resortData?.ok ? resortData.results || [] : []),
      ];
      renderAlsoNearby(calloutItems, eduData?.state || parkData?.state || resortData?.state || '');
    })
    .catch(() => {
      resultsList.innerHTML = `
        <article class="result-card">
          <h3>Search unavailable</h3>
          <p class="result-meta">Make sure the server is running with npm start, then try again.</p>
        </article>`;
      renderAlsoNearby([]);
    });
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  fetchResults(queryInput.value.trim(), categoryFilter.value, zipInput.value.trim());
});

// Auto-search when a category is chosen or a ZIP is completed — picking a category
// or finishing a ZIP already feels like a completed action, so don't make the user
// remember a separate button press for those. Typed names still require the button
// (or Enter), since searching on every keystroke would be noisy and need debouncing.
categoryFilter.addEventListener('change', () => {
  fetchResults(queryInput.value.trim(), categoryFilter.value, zipInput.value.trim());
});

zipInput.addEventListener('input', () => {
  if (zipInput.value.replace(/\D/g, '').length === 5) {
    fetchResults(queryInput.value.trim(), categoryFilter.value, zipInput.value.trim());
  }
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

