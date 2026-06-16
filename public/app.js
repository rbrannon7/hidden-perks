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

function buildScript(name, discount, ageReq, conditions) {
  const age = ageReq ? `${ageReq}+` : 'Ask at location';
  const lines = [
    `${name} — Senior Discount`,
    ``,
    `Discount: ${discount || 'Ask at the register'}`,
    `Age Required: ${age}`,
    `Conditions: ${conditions || 'Ask at the register for current terms'}`,
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

    return `
      <article class="result-card${item.featured ? ' result-card--featured' : ''}" id="card-${esc(item.id)}">
        <div class="card-header">
          <h3>${esc(item.name)}</h3>
          ${ageBadge}
          ${featuredBadge}
          ${localBadge}
        </div>
        ${item.address ? `<p class="card-address">📍 ${esc(item.address)}</p>` : `<p class="card-tagline">Ask for this discount when you make a purchase.</p>`}
        <div class="detail-box">
          <p class="detail-label"><b>Discount Details</b></p>
          <p class="detail-value">${esc(item.discount || 'Ask at the register')}</p>
        </div>
        <div class="detail-box">
          <p class="detail-label"><b>Conditions</b></p>
          <p class="detail-value">${esc(conditions)}</p>
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

  const nearbySearch = zip.length === 5
    ? fetch(`/api/nearby?${new URLSearchParams({ zip, ...(category && { category }) })}`)
        .then((r) => r.json())
        .catch(() => null)
    : Promise.resolve(null);

  Promise.all([baseSearch, nearbySearch])
    .then(([searchData, nearbyData]) => {
      let results = searchData.results || [];
      let locationLabel = '';

      if (nearbyData?.ok && nearbyData.results?.length) {
        if (category === 'parks') {
          // Parks: combine national parks (from /api/search) + state parks (from /api/nearby)
          results = [...results, ...nearbyData.results];
          const stateName = nearbyData.state || '';
          locationLabel = `📍 All National Parks + ${stateName} State Parks`;
        } else {
          // ZIP search worked — show only nearby locations + local submissions for that ZIP
          const localResults = results.filter((r) => r.source === 'local');
          results = [...nearbyData.results, ...localResults];
          const city = nearbyData.city ? `${nearbyData.city} ` : '';
          locationLabel = `📍 Showing locations near ${city}ZIP ${nearbyData.zip}`;
        }
      } else if (zip.length === 5) {
        if (category === 'parks') {
          locationLabel = `Showing all National Parks — enter a ZIP to also see your state's parks`;
        } else {
          // ZIP entered but Places API unavailable or no matches — show all national chains
          locationLabel = `Showing all national chains — location search unavailable for ZIP ${zip}`;
        }
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

// PWA install prompt
let deferredInstall = null;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const installDismiss = document.getElementById('installDismiss');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (installBanner) installBanner.hidden = false;
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    deferredInstall = null;
    if (installBanner) installBanner.hidden = true;
  });
}

if (installDismiss) {
  installDismiss.addEventListener('click', () => {
    if (installBanner) installBanner.hidden = true;
  });
}

window.addEventListener('appinstalled', () => {
  if (installBanner) installBanner.hidden = true;
  deferredInstall = null;
});

