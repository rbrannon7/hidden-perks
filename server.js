require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const { getVerifiedLocalBusinesses, saveLocalBusiness, getAllSubmissions, approveSubmission, rejectSubmission } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const nationalChainsPath = path.join(__dirname, 'data', 'national-chains.json');
const nationalChains = JSON.parse(fs.readFileSync(nationalChainsPath, 'utf8'));

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '');
}

function searchNationalChains(query) {
  const term = normalize(query);
  if (!term) return nationalChains;
  return nationalChains.filter((item) => {
    const haystack = normalize(
      [item.name, item.category, item.discount, item.conditions, item.city, item.state]
        .filter(Boolean)
        .join(' ')
    );
    return haystack.includes(term);
  });
}

// GET /api/search?q=&category=&zip=
app.get('/api/search', (req, res) => {
  const query = req.query.q || '';
  const category = req.query.category || '';
  const zip = (req.query.zip || '').replace(/\D/g, '').slice(0, 5);

  let results = searchNationalChains(query);
  if (category) {
    results = results.filter((item) => item.category === category);
  }

  const local = getVerifiedLocalBusinesses(query, zip);
  res.json({
    query,
    zip,
    results: [...results.map((r) => ({ ...r, source: 'national' })), ...local],
  });
});

// POST /api/submit — save a user-submitted local business discount
app.post('/api/submit', (req, res) => {
  const { name, address, city, state, zip, category, discount, ageRequirement, conditions, submittedBy } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ ok: false, error: 'Business name is required.' });
  }
  if (!discount || !discount.trim()) {
    return res.status(400).json({ ok: false, error: 'Discount description is required.' });
  }

  const id = saveLocalBusiness({
    name: name.trim(),
    address: (address || '').trim(),
    city: (city || '').trim(),
    state: (state || '').trim().toUpperCase().slice(0, 2),
    zip: (zip || '').replace(/\D/g, '').slice(0, 5),
    category: category || 'local',
    discount: discount.trim(),
    ageRequirement: parseInt(ageRequirement) || null,
    conditions: (conditions || '').trim(),
    submittedBy: (submittedBy || '').trim(),
  });

  res.json({ ok: true, id });
});

// POST /api/admin/fetch-details — use Claude to extract senior discount info from a restaurant website
app.post('/api/admin/fetch-details', async (req, res) => {
  const { businessId, url, businessName } = req.body;

  if (!url && !businessName) {
    return res.status(400).json({ error: 'url or businessName is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on this server' });
  }

  const client = new Anthropic();
  let htmlContent = '';

  if (url) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HiddenPerks/1.0)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(10000),
      });
      const raw = await resp.text();
      // Strip JS/CSS to reduce noise; keep first 15k chars
      htmlContent = raw
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .slice(0, 15000);
    } catch {
      // Fall back to knowledge-only prompt if the site can't be fetched
    }
  }

  const prompt = htmlContent
    ? `Extract any senior discount information for "${businessName}" from this webpage content.\n\nPage content:\n${htmlContent}\n\nReturn ONLY valid JSON matching this shape exactly:\n{"discount":"...","ageRequirement":55,"conditions":"..."}\n\nIf the page has no senior discount info, use your knowledge about this chain's typical policy. No commentary — JSON only.`
    : `What senior discount does "${businessName}" typically offer?\nReturn ONLY valid JSON: {"discount":"...","ageRequirement":55,"conditions":"..."}`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) {
      return res.status(502).json({ error: 'No JSON found in AI response', raw: text.slice(0, 500) });
    }

    const extracted = JSON.parse(match[0]);
    res.json({ ok: true, businessId, extracted, sourceUrl: url || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Admin helper ===
function requireAdmin(req, res) {
  const pw = req.headers['x-admin-password'];
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) {
    res.status(503).json({ ok: false, error: 'ADMIN_PASSWORD environment variable is not set on this server.' });
    return false;
  }
  if (pw !== configured) {
    res.status(401).json({ ok: false, error: 'Incorrect password.' });
    return false;
  }
  return true;
}

// GET /api/admin/submissions
app.get('/api/admin/submissions', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, submissions: getAllSubmissions() });
});

// POST /api/admin/approve/:id
app.post('/api/admin/approve/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const ok = approveSubmission(req.params.id);
  if (!ok) return res.status(404).json({ ok: false, error: 'Submission not found.' });
  res.json({ ok: true });
});

// POST /api/admin/reject/:id
app.post('/api/admin/reject/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const ok = rejectSubmission(req.params.id);
  if (!ok) return res.status(404).json({ ok: false, error: 'Submission not found.' });
  res.json({ ok: true });
});

// GET /api/nearby?zip=84321&category=restaurant
// Requires GOOGLE_PLACES_API_KEY environment variable — returns 503 until configured.
app.get('/api/nearby', async (req, res) => {
  const zip = (req.query.zip || '').replace(/\D/g, '').slice(0, 5);
  const category = req.query.category || '';

  if (!zip || zip.length < 5) {
    return res.status(400).json({ ok: false, error: 'Enter a valid 5-digit ZIP code.' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, configured: false, error: 'Google Places not configured yet.' });
  }

  try {
    // Step 1: geocode ZIP to lat/lng
    const geoResp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${zip}&components=postal_code:${zip}|country:US&key=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const geoData = await geoResp.json();

    if (!geoData.results?.length) {
      return res.status(404).json({ ok: false, error: `ZIP code ${zip} not found.` });
    }

    const { lat, lng } = geoData.results[0].geometry.location;
    const cityComp = geoData.results[0].address_components?.find((c) => c.types.includes('locality'));
    const cityName = cityComp?.long_name || '';

    // Step 2: nearby search with a 20-mile (32 km) radius
    const typeMap = {
      restaurant: 'restaurant',
      pharmacy: 'pharmacy',
      retail: 'store',
      entertainment: 'movie_theater',
      travel: 'lodging',
    };
    // For grocery, Google's type=grocery_or_supermarket misses big-box stores (Walmart,
    // Sam's Club, Smith's, etc.) so we make two parallel calls and merge by place_id.
    const googleType = typeMap[category] || '';
    const baseUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=32000&key=${apiKey}`;

    let places = [];
    if (category === 'grocery') {
      // Three parallel calls: typed grocery, keyword food/market, and big-box stores
      // (Walmart/Sam's Club use Google category 'superstore' and don't appear in the others)
      const [r1, r2, r3] = await Promise.all([
        fetch(`${baseUrl}&type=grocery_or_supermarket`, { signal: AbortSignal.timeout(8000) }),
        fetch(`${baseUrl}&keyword=supermarket+food+market+store`, { signal: AbortSignal.timeout(8000) }),
        fetch(`${baseUrl}&keyword=walmart+sams+club`, { signal: AbortSignal.timeout(8000) }),
      ]);
      const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
      const seen = new Set();
      for (const p of [...(d1.results || []), ...(d2.results || []), ...(d3.results || [])]) {
        if (!seen.has(p.place_id)) { seen.add(p.place_id); places.push(p); }
      }
    } else {
      let nearbyUrl = baseUrl;
      if (googleType) nearbyUrl += `&type=${googleType}`;
      const nearbyResp = await fetch(nearbyUrl, { signal: AbortSignal.timeout(8000) });
      const nearbyData = await nearbyResp.json();
      places = nearbyData.results || [];
    }

    // Step 3: match each place name against our national chains database
    const results = [];
    const seenChainIds = new Set();

    for (const place of places) {
      const placeName = normalize(place.name);
      const match = nationalChains.find((chain) => {
        const chainName = normalize(chain.name);
        if (chainName.length < 4) return false;
        return placeName.includes(chainName) || chainName.includes(placeName);
      });

      if (match && !seenChainIds.has(match.id)) {
        seenChainIds.add(match.id);
        results.push({
          id: `nearby-${place.place_id}`,
          nationalId: match.id,
          name: place.name,
          address: place.vicinity,
          category: match.category,
          discount: match.discount,
          ageRequirement: match.ageRequirement,
          conditions: match.conditions,
          sourceUrl: match.sourceUrl,
          lastVerified: match.lastVerified,
          national: true,
          source: 'nearby',
          nearZip: zip,
          nearCity: cityName,
        });
      }
    }

    // Google already filtered by type; don't re-filter by our internal category
    const debug_place_names = places.map((p) => p.name);
    res.json({ ok: true, zip, city: cityName, lat, lng, results, debug_place_names });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`HiddenPerks running at http://localhost:${PORT}`);
});
