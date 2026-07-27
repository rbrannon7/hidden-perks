require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');

const { getVerifiedLocalBusinesses, saveLocalBusiness, getAllSubmissions, approveSubmission, rejectSubmission, updateSubmission } = require('./database');
const { normalize, textMatches } = require('./search');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight health check — no DB access, used by uptime/keep-alive pings.
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many submissions — please try again later.' },
});

const nearbyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests — please try again later.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many admin requests — please try again later.' },
});

const nationalChainsPath = path.join(__dirname, 'data', 'national-chains.json');
const nationalChains = JSON.parse(fs.readFileSync(nationalChainsPath, 'utf8'));

const parksPath = path.join(__dirname, 'data', 'parks.json');
const allParks = JSON.parse(fs.readFileSync(parksPath, 'utf8'));
const nationalParks = allParks.filter((p) => p.subcategory === 'national');
const stateParks = allParks
  .filter((p) => p.subcategory === 'state')
  .sort((a, b) => (a.state + a.name).localeCompare(b.state + b.name));

function searchNationalChains(query) {
  if (!query) return nationalChains;
  return nationalChains.filter((item) => {
    const haystack = [item.name, item.category, item.discount, item.conditions, item.city, item.state]
      .filter(Boolean)
      .join(' ');
    return textMatches(haystack, query);
  });
}

// GET /api/search?q=&category=&zip=
app.get('/api/search', (req, res) => {
  const query = req.query.q || '';
  const category = req.query.category || '';
  const zip = (req.query.zip || '').replace(/\D/g, '').slice(0, 5);

  const matchesParkQuery = (p) =>
    textMatches([p.name, p.category, p.discount, p.conditions, p.state].filter(Boolean).join(' '), query);

  // National Parks: always return all national parks nationwide, regardless of ZIP
  if (category === 'national-parks') {
    return res.json({
      query,
      zip,
      results: nationalParks.filter(matchesParkQuery).map((p) => ({ ...p, source: 'national' })),
    });
  }

  // State Parks: with no ZIP, show all state parks nationwide; with a ZIP, the
  // frontend calls /api/nearby instead to filter down to that ZIP's state.
  if (category === 'state-parks') {
    return res.json({
      query,
      zip,
      results: stateParks.filter(matchesParkQuery).map((p) => ({ ...p, source: 'national' })),
    });
  }

  let results = searchNationalChains(query);
  let local = getVerifiedLocalBusinesses(query, zip);
  if (category) {
    results = results.filter((item) => item.category === category);
    local = local.filter((item) => item.category === category);
  }

  res.json({
    query,
    zip,
    results: [...results.map((r) => ({ ...r, source: 'national' })), ...local],
  });
});

// POST /api/submit — save a user-submitted local business discount
app.post('/api/submit', submitLimiter, (req, res) => {
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
app.post('/api/admin/fetch-details', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
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
    } catch (err) {
      // Fall back to knowledge-only prompt if the site can't be fetched
      console.error(`fetch-details: failed to fetch ${url} —`, err.message);
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
      console.error(`fetch-details: no JSON in Claude response for "${businessName}" —`, text.slice(0, 500));
      return res.status(502).json({ error: 'No JSON found in AI response', raw: text.slice(0, 500) });
    }

    const extracted = JSON.parse(match[0]);
    res.json({ ok: true, businessId, extracted, sourceUrl: url || '' });
  } catch (err) {
    console.error('fetch-details: Claude API error —', err.message);
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
app.get('/api/admin/submissions', adminLimiter, (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, submissions: getAllSubmissions() });
});

// POST /api/admin/approve/:id
app.post('/api/admin/approve/:id', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const result = await approveSubmission(req.params.id);
  if (!result.found) return res.status(404).json({ ok: false, error: 'Submission not found.' });
  res.json({ ok: true, persisted: result.persisted });
});

// POST /api/admin/reject/:id
app.post('/api/admin/reject/:id', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const result = await rejectSubmission(req.params.id);
  if (!result.found) return res.status(404).json({ ok: false, error: 'Submission not found.' });
  res.json({ ok: true, persisted: result.persisted });
});

// POST /api/admin/edit/:id
app.post('/api/admin/edit/:id', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const result = await updateSubmission(req.params.id, req.body || {});
  if (!result.found) return res.status(404).json({ ok: false, error: 'Submission not found.' });
  res.json({ ok: true, submission: result.submission, persisted: result.persisted });
});

// In-memory cache for /api/nearby responses, keyed by zip+category, to avoid
// re-hitting Google's Geocoding/Places APIs for repeat searches.
const NEARBY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const nearbyCache = new Map();

// GET /api/nearby?zip=84321&category=restaurant
// Requires GOOGLE_PLACES_API_KEY environment variable — returns 503 until configured.
app.get('/api/nearby', nearbyLimiter, async (req, res) => {
  const zip = (req.query.zip || '').replace(/\D/g, '').slice(0, 5);
  const category = req.query.category || '';
  const query = req.query.q || '';

  // Cached/fetched results are stored unfiltered (keyed only on zip+category) so the
  // cache stays reusable across different name searches; the typed name is applied
  // as a filter on top, per request, so it doesn't bypass the cache.
  const filterByQuery = (data) => {
    if (!query) return data;
    return {
      ...data,
      results: data.results.filter((r) =>
        textMatches([r.name, r.category, r.discount, r.conditions].filter(Boolean).join(' '), query)
      ),
    };
  };

  if (!zip || zip.length < 5) {
    return res.status(400).json({ ok: false, error: 'Enter a valid 5-digit ZIP code.' });
  }

  // National Parks are nationwide and never ZIP-dependent — nothing to look up here
  if (category === 'national-parks') {
    return res.json({ ok: true, zip, results: [] });
  }

  const cacheKey = `${zip}:${category}`;
  const cached = nearbyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < NEARBY_CACHE_TTL_MS) {
    return res.json(filterByQuery(cached.data));
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, configured: false, error: 'Google Places not configured yet.' });
  }

  try {
    // Step 1: geocode ZIP to lat/lng (and state for parks)
    const geoResp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${zip}&components=postal_code:${zip}|country:US&key=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const geoData = await geoResp.json();

    if (!geoData.results?.length) {
      return res.status(404).json({ ok: false, error: `ZIP code ${zip} not found.` });
    }

    const { lat, lng } = geoData.results[0].geometry.location;
    const addrComps = geoData.results[0].address_components || [];
    const cityComp = addrComps.find((c) => c.types.includes('locality'));
    const cityName = cityComp?.long_name || '';
    const stateComp = addrComps.find((c) => c.types.includes('administrative_area_level_1'));
    const stateCode = stateComp?.short_name || '';

    // State Parks: skip Google Places entirely; filter parks.json by state
    if (category === 'state-parks') {
      const nearby = stateParks
        .filter((p) => p.state === stateCode)
        .map((p) => ({ ...p, source: 'nearby', nearZip: zip, nearCity: cityName, nearState: stateCode }));
      const data = { ok: true, zip, city: cityName, state: stateCode, lat, lng, results: nearby };
      nearbyCache.set(cacheKey, { timestamp: Date.now(), data });
      return res.json(filterByQuery(data));
    }

    // Education (state senior tuition-waiver programs, etc.): these are statewide
    // government/institutional programs, not searchable "places" — skip Google
    // Places entirely and filter national-chains.json entries by state instead.
    if (category === 'education') {
      const nearby = nationalChains
        .filter((item) => item.category === 'education' && item.state === stateCode)
        .map((item) => ({ ...item, source: 'nearby', nearZip: zip, nearCity: cityName, nearState: stateCode }));
      const data = { ok: true, zip, city: cityName, state: stateCode, lat, lng, results: nearby };
      nearbyCache.set(cacheKey, { timestamp: Date.now(), data });
      return res.json(filterByQuery(data));
    }

    // Ski Resorts: these are destinations people travel to, not "near me" in
    // the 20-mile-radius sense Google Places nearby search is built for — skip
    // Places entirely and show all resorts in the ZIP's state instead.
    if (category === 'ski-resorts') {
      const nearby = nationalChains
        .filter((item) => item.category === 'ski-resorts' && item.state === stateCode)
        .map((item) => ({ ...item, source: 'nearby', nearZip: zip, nearCity: cityName, nearState: stateCode }));
      const data = { ok: true, zip, city: cityName, state: stateCode, lat, lng, results: nearby };
      nearbyCache.set(cacheKey, { timestamp: Date.now(), data });
      return res.json(filterByQuery(data));
    }

    // Step 2: nearby search
    // Entertainment uses a wider 50-mile radius; all other categories use 20 miles
    const radius = category === 'entertainment' ? 80467 : 32000;
    const baseUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&key=${apiKey}`;

    // Fetch one or more Places URLs in parallel, deduplicated by place_id.
    // Only the first page (up to 20 results per URL) is used — fetching additional
    // pages requires a mandatory 2-second wait per Google's API, which isn't worth
    // the delay for this app's purposes.
    async function fetchPlaces(urls) {
      const seen = new Set();
      const all = [];

      const pages = await Promise.all(
        urls.map(u => fetch(u, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch((err) => {
          console.error(`nearby: Places fetch failed for ${u} —`, err.message);
          return { results: [] };
        }))
      );
      for (const d of pages) {
        for (const p of (d.results || [])) {
          if (!seen.has(p.place_id)) { seen.add(p.place_id); all.push(p); }
        }
      }

      return all;
    }

    const typeMap = { pharmacy: 'pharmacy', travel: 'lodging' };
    const googleType = typeMap[category] || '';

    let places = [];
    if (category === 'restaurant') {
      places = await fetchPlaces([
        `${baseUrl}&type=restaurant`,
        `${baseUrl}&type=meal_takeaway`,
      ]);
    } else if (category === 'retail') {
      places = await fetchPlaces([
        `${baseUrl}&type=store`,
        `${baseUrl}&type=department_store`,
        `${baseUrl}&type=hardware_store`,
        `${baseUrl}&type=clothing_store`,
      ]);
    } else if (category === 'grocery') {
      places = await fetchPlaces([
        `${baseUrl}&type=grocery_or_supermarket`,
        `${baseUrl}&keyword=supermarket+food+market+store`,
        `${baseUrl}&keyword=walmart+sams+club`,
      ]);
    } else if (category === 'entertainment') {
      places = await fetchPlaces([
        `${baseUrl}&type=movie_theater`,
        `${baseUrl}&type=bowling_alley`,
        `${baseUrl}&type=gym`,
        `${baseUrl}&type=museum`,
        `${baseUrl}&keyword=hot+springs`,
      ]);
    } else {
      places = await fetchPlaces([baseUrl + (googleType ? `&type=${googleType}` : '')]);
    }

    // Step 3: match each place name against our national chains database
    const results = [];
    const seenChainIds = new Set();

    const STOPWORDS = new Set(['the', 'a', 'an']);

    for (const place of places) {
      const placeName = normalize(place.name);
      const match = nationalChains.find((chain) => {
        const chainName = normalize(chain.name);
        if (chainName.length < 4) return false;
        if (placeName.includes(chainName) || chainName.includes(placeName)) return true;
        // Google often appends a location/screen-count suffix (e.g. "AMC Logan 8", "Cinemark Cache Valley").
        // Try matching on the first brand word so those still resolve to our chain entry.
        // Skip generic leading words (e.g. "The") so unrelated chains sharing a stopword don't false-match.
        const brandWord = chainName.split(' ')[0];
        if (brandWord.length >= 3 && !STOPWORDS.has(brandWord) && placeName.startsWith(brandWord)) return true;
        return false;
      });

      if (match && !seenChainIds.has(match.id)) {
        seenChainIds.add(match.id);
        results.push({
          id: `nearby-${place.place_id}`,
          nationalId: match.id,
          name: place.name,
          // Google's "vicinity" already includes the city (e.g. "865 South Main
          // Street, Logan"), so state/zip are added separately here rather than
          // a city field, which would otherwise duplicate it in the displayed address.
          address: place.vicinity,
          state: stateCode,
          zip,
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
    const data = { ok: true, zip, city: cityName, lat, lng, results, debug_place_names };
    nearbyCache.set(cacheKey, { timestamp: Date.now(), data });
    res.json(filterByQuery(data));
  } catch (err) {
    console.error(`nearby: unexpected error for zip ${zip}, category ${category} —`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`HiddenPerks running at http://localhost:${PORT}`);
});
