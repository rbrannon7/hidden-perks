const path = require('path');
const fs = require('fs');
const { textMatches } = require('./search');

const dbDir = process.env.DATA_DIR || path.join(__dirname, 'db');
const submissionsFile = path.join(dbDir, 'submissions.json');

function ensureStorage() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (!fs.existsSync(submissionsFile)) {
    fs.writeFileSync(submissionsFile, '[]', 'utf8');
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

function initializeDatabase() {
  ensureStorage();
  return { ok: true };
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

function updateSubmission(id, fields) {
  const items = readSubmissions();
  const idx = items.findIndex((item) => String(item.id) === String(id));
  if (idx === -1) return false;

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
  return items[idx];
}

function approveSubmission(id) {
  const items = readSubmissions();
  const idx = items.findIndex((item) => String(item.id) === String(id));
  if (idx === -1) return false;
  items[idx].verified = 1;
  writeSubmissions(items);
  return true;
}

function rejectSubmission(id) {
  const items = readSubmissions();
  const filtered = items.filter((item) => String(item.id) !== String(id));
  if (filtered.length === items.length) return false;
  writeSubmissions(filtered);
  return true;
}

module.exports = {
  initializeDatabase,
  saveLocalBusiness,
  getVerifiedLocalBusinesses,
  getAllSubmissions,
  approveSubmission,
  rejectSubmission,
  updateSubmission,
};
