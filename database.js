const path = require('path');
const fs = require('fs');
const { textMatches } = require('./search');

const dbDir = process.env.DATA_DIR || path.join(__dirname, 'db');
const submissionsFile = path.join(dbDir, 'submissions.json');

// Durable copy of *verified* local businesses, tracked in git. Render's free
// tier has no persistent disk, so anything written only to `dbDir` at runtime
// is wiped on the next restart/redeploy — this file (baked into the deployed
// image) is what survives. Submitter emails are never written here since the
// repo is public; they only live in the ephemeral `submissionsFile` copy.
const verifiedBusinessesFile = path.join(__dirname, 'data', 'local-businesses.json');

const GITHUB_OWNER = 'rbrannon7';
const GITHUB_REPO_NAME = 'hidden-perks';
const GITHUB_BRANCH = 'master';
const GITHUB_FILE_PATH = 'data/local-businesses.json';

function readVerifiedBusinessesSeed() {
  try {
    return JSON.parse(fs.readFileSync(verifiedBusinessesFile, 'utf8'));
  } catch {
    return [];
  }
}

function ensureStorage() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (!fs.existsSync(submissionsFile)) {
    // Fresh container: seed from the durable, git-committed verified businesses
    // so approved listings survive a restart even though this working copy doesn't.
    const seed = readVerifiedBusinessesSeed().map((item) => ({
      ...item,
      submitted_by: item.submitted_by || '',
      verified: 1,
    }));
    fs.writeFileSync(submissionsFile, JSON.stringify(seed, null, 2), 'utf8');
  }
}

function readSubmissions() {
  ensureStorage();
  return JSON.parse(fs.readFileSync(submissionsFile, 'utf8'));
}

function writeSubmissions(items) {
  ensureStorage();
  fs.writeFileSync(submissionsFile, JSON.stringify(items, null, 2), 'utf8');
}

// Commits the current set of verified businesses to GitHub via the Contents API,
// so it's baked into the next deploy and survives future restarts. Returns false
// (without throwing) if GITHUB_TOKEN isn't configured or the push fails — callers
// surface that to the admin UI as a "saved locally, not persisted" warning.
async function commitVerifiedBusinessesToGitHub(verifiedItems) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('GITHUB_TOKEN not set — verified local businesses were saved locally only.');
    return false;
  }

  const redacted = verifiedItems.map(({ submitted_by, ...rest }) => rest);
  const content = Buffer.from(JSON.stringify(redacted, null, 2) + '\n', 'utf8').toString('base64');
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO_NAME}/contents/${GITHUB_FILE_PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hiddenperks-admin',
  };

  try {
    let sha;
    const getResp = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers });
    if (getResp.ok) {
      sha = (await getResp.json()).sha;
    } else if (getResp.status !== 404) {
      throw new Error(`GET failed: ${getResp.status}`);
    }

    const putResp = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Update verified local businesses (admin dashboard)',
        content,
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!putResp.ok) {
      throw new Error(`PUT failed: ${putResp.status} — ${await putResp.text()}`);
    }

    return true;
  } catch (err) {
    console.error('Failed to persist verified local businesses to GitHub —', err.message);
    return false;
  }
}

function saveLocalBusiness(submission) {
  const items = readSubmissions();
  const record = {
    id: Date.now(),
    name: submission.name,
    address: submission.address || '',
    city: submission.city || '',
    state: submission.state || '',
    zip: submission.zip || '',
    category: submission.category || 'local',
    discount: submission.discount,
    age_requirement: submission.ageRequirement || null,
    conditions: submission.conditions || '',
    submitted_by: submission.submittedBy || 'anonymous',
    verified: 0,
    created_at: new Date().toISOString(),
  };

  items.unshift(record);
  writeSubmissions(items);
  return record.id;
}

function getVerifiedLocalBusinesses(query = '', zip = '') {
  const zipTerm = String(zip || '').replace(/\D/g, '').slice(0, 5);
  let items = readSubmissions().filter((item) => item.verified === 1);

  if (zipTerm) {
    items = items.filter((item) => item.zip === zipTerm);
  }

  const toResult = (r) => ({ ...r, source: 'local', ageRequirement: r.age_requirement });

  if (!query) {
    return items.slice(0, 50).map(toResult);
  }

  return items.filter((item) => {
    const haystack = [item.name, item.category, item.discount, item.conditions, item.city, item.state]
      .filter(Boolean)
      .join(' ');
    return textMatches(haystack, query);
  }).slice(0, 50).map(toResult);
}

function getAllSubmissions() {
  return readSubmissions();
}

async function updateSubmission(id, fields) {
  const items = readSubmissions();
  const idx = items.findIndex((item) => String(item.id) === String(id));
  if (idx === -1) return { found: false };

  const editable = ['name', 'address', 'city', 'state', 'zip', 'category', 'discount', 'conditions'];
  for (const key of editable) {
    if (fields[key] === undefined) continue;
    if (key === 'zip') {
      items[idx].zip = String(fields.zip).replace(/\D/g, '').slice(0, 5);
    } else if (key === 'state') {
      items[idx].state = String(fields.state).trim().toUpperCase().slice(0, 2);
    } else {
      items[idx][key] = String(fields[key]).trim();
    }
  }
  if (fields.age_requirement !== undefined) {
    items[idx].age_requirement = parseInt(fields.age_requirement) || null;
  }

  writeSubmissions(items);

  // Only verified (publicly-shown) edits need to be pushed to the durable copy —
  // edits to a still-pending submission stay ephemeral, same as before.
  let persisted = true;
  if (items[idx].verified === 1) {
    persisted = await commitVerifiedBusinessesToGitHub(items.filter((i) => i.verified === 1));
  }

  return { found: true, persisted, submission: items[idx] };
}

async function approveSubmission(id) {
  const items = readSubmissions();
  const idx = items.findIndex((item) => String(item.id) === String(id));
  if (idx === -1) return { found: false };
  items[idx].verified = 1;
  writeSubmissions(items);

  const persisted = await commitVerifiedBusinessesToGitHub(items.filter((i) => i.verified === 1));
  return { found: true, persisted };
}

async function rejectSubmission(id) {
  const items = readSubmissions();
  const target = items.find((item) => String(item.id) === String(id));
  if (!target) return { found: false };

  const filtered = items.filter((item) => String(item.id) !== String(id));
  writeSubmissions(filtered);

  // Only need to re-push the durable copy if the deleted item had been verified —
  // otherwise it was never committed to GitHub in the first place.
  let persisted = true;
  if (target.verified === 1) {
    persisted = await commitVerifiedBusinessesToGitHub(filtered.filter((i) => i.verified === 1));
  }

  return { found: true, persisted };
}

module.exports = {
  saveLocalBusiness,
  getVerifiedLocalBusinesses,
  getAllSubmissions,
  approveSubmission,
  rejectSubmission,
  updateSubmission,
};
