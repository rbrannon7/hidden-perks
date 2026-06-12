require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const { saveLocalBusiness, getVerifiedLocalBusinesses } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const nationalChainsPath = path.join(__dirname, 'data', 'national-chains.json');
const nationalChains = JSON.parse(fs.readFileSync(nationalChainsPath, 'utf8'));

function normalize(value) {
  return String(value || '').toLowerCase().trim();
}

function searchNationalChains(query) {
  const term = normalize(query);
  if (!term) return nationalChains;
  return nationalChains.filter((item) => {
    const haystack = [item.name, item.category, item.discount, item.conditions, item.city, item.state]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}

// GET /api/search?q=&category=
app.get('/api/search', (req, res) => {
  const query = req.query.q || '';
  const category = req.query.category || '';

  let results = searchNationalChains(query);
  if (category) {
    results = results.filter((item) => item.category === category);
  }

  const local = getVerifiedLocalBusinesses(query);
  res.json({
    query,
    results: [...results.map((r) => ({ ...r, source: 'national' })), ...local],
  });
});

// POST /api/submit — user submits a local business discount for review
app.post('/api/submit', (req, res) => {
  const { name, discount } = req.body;
  if (!name || !discount) {
    return res.status(400).json({ error: 'name and discount are required' });
  }
  try {
    const id = saveLocalBusiness(req.body);
    res.json({ ok: true, id, message: 'Thank you! Your submission has been received and is under review.' });
  } catch {
    res.status(500).json({ error: 'Could not save submission' });
  }
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`HiddenPerks running at http://localhost:${PORT}`);
});
