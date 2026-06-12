// Admin mode: run  localStorage.setItem('hp_admin', '1')  in the browser console to enable
const IS_ADMIN = localStorage.getItem('hp_admin') === '1';

// === DOM refs ===
const resultsList = document.getElementById('resultsList');
const resultCount = document.getElementById('resultCount');
const searchForm = document.getElementById('searchForm');
const queryInput = document.getElementById('queryInput');
const askModal = document.getElementById('askModal');
const askScript = document.getElementById('askScript');
const showMode = document.getElementById('showMode');
const showScript = document.getElementById('showScript');

// === Helpers ===
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildScript(name, discount, ageReq) {
  const qualifier = ageReq ? `${ageReq}+` : 'senior';
  const discountText = discount || 'a senior discount';
  return `Hi! I'd love to use my senior discount today. I understand ${name} offers ${discountText} for ${qualifier} customers. Thank you so much!`;
}

// === Render result cards ===
function renderResults(results) {
  resultCount.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;

  if (!results.length) {
    resultsList.innerHTML = `
      <article class="result-card">
        <h3>No results found</h3>
        <p class="result-meta">Try a chain name like Denny's, IHOP, Starbucks, or Olive Garden.</p>
      </article>`;
    return;
  }

  resultsList.innerHTML = results.map((item) => {
    const age = item.ageRequirement ? `${item.ageRequirement}+` : 'Ask at location';
    const conditions = item.conditions || 'Ask at the register for current terms';
    const officialUrl = item.sourceUrl
      ? item.sourceUrl
      : `https://www.google.com/search?q=${encodeURIComponent(item.name + ' senior discount')}`;

    const adminBtn = IS_ADMIN
      ? `<button type="button" class="btn-admin-fetch" data-id="${esc(item.id)}" data-url="${esc(item.sourceUrl || '')}" data-name="${esc(item.name)}">↺ Fetch Details</button>`
      : '';

    return `
      <article class="result-card" id="card-${esc(item.id)}">
        <h3>${esc(item.name)}</h3>
        <p class="result-meta">${esc(item.category || 'restaurant')} · ${item.source === 'national' ? 'National chain' : 'Local'}</p>
        <div class="detail-box">
          <p class="detail-label">1. Discount details</p>
          <p class="detail-value">${esc(item.discount || 'Ask at the register')}</p>
        </div>
        <div class="detail-box">
          <p class="detail-label">2. Age requirement</p>
          <p class="detail-value">${esc(age)}</p>
        </div>
        <div class="detail-box">
          <p class="detail-label">3. Conditions</p>
          <p class="detail-value">${esc(conditions)}</p>
        </div>
        <div id="admin-preview-${esc(item.id)}" class="admin-preview" hidden></div>
        <div class="result-actions">
          <button type="button" class="btn-ask"
            data-name="${esc(item.name)}"
            data-discount="${esc(item.discount || '')}"
            data-age="${esc(String(item.ageRequirement || ''))}">Ask For Me</button>
          <button type="button" onclick="window.open('${esc(officialUrl)}','_blank')">Official Site</button>
          ${adminBtn}
        </div>
      </article>`;
  }).join('');

  document.querySelectorAll('.btn-ask').forEach((btn) => {
    btn.addEventListener('click', () => openAskModal(btn.dataset.name, btn.dataset.discount, btn.dataset.age));
  });

  if (IS_ADMIN) {
    document.querySelectorAll('.btn-admin-fetch').forEach((btn) => {
      btn.addEventListener('click', () => fetchAdminDetails(btn.dataset.id, btn.dataset.url, btn.dataset.name));
    });
  }
}

// === Ask For Me modal ===
function openAskModal(name, discount, ageReq) {
  askScript.textContent = buildScript(name, discount, ageReq);
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
function fetchResults(query) {
  fetch(`/api/search?q=${encodeURIComponent(query)}`)
    .then((res) => res.json())
    .then((data) => renderResults(data.results || []))
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
  fetchResults(queryInput.value.trim() || 'restaurant');
});

// === Submission form ===
document.getElementById('toggleSubmit').addEventListener('click', () => {
  const section = document.getElementById('submitSection');
  const btn = document.getElementById('toggleSubmit');
  section.hidden = !section.hidden;
  btn.textContent = section.hidden
    ? 'Know a local senior discount? Submit it here ↓'
    : 'Know a local senior discount? Submit it here ↑';
});

document.getElementById('submitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const msg = document.getElementById('submitMsg');

  const payload = {
    name: (fd.get('name') || '').trim(),
    discount: (fd.get('discount') || '').trim(),
    address: (fd.get('address') || '').trim(),
    city: (fd.get('city') || '').trim(),
    state: (fd.get('state') || '').trim(),
    zip: (fd.get('zip') || '').trim(),
    ageRequirement: parseInt(fd.get('ageRequirement'), 10) || null,
    conditions: (fd.get('conditions') || '').trim(),
    submittedBy: (fd.get('submittedBy') || '').trim(),
    category: 'local',
  };

  msg.hidden = false;
  msg.textContent = 'Submitting…';
  msg.className = 'submit-msg';

  try {
    const resp = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    if (result.ok) {
      msg.textContent = result.message;
      msg.className = 'submit-msg submit-success';
      e.target.reset();
    } else {
      msg.textContent = result.error || 'Submission failed. Please try again.';
      msg.className = 'submit-msg submit-error';
    }
  } catch {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'submit-msg submit-error';
  }
});

// Initial load
fetchResults('restaurant');
