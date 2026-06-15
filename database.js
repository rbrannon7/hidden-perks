const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'db');
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
  const term = String(query || '').trim().toLowerCase();
  const zipTerm = String(zip || '').replace(/\D/g, '').slice(0, 5);
  let items = readSubmissions().filter((item) => item.verified === 1);

  if (zipTerm) {
    items = items.filter((item) => item.zip === zipTerm);
  }

  if (!term) {
    return items.slice(0, 50).map((r) => ({ ...r, source: 'local' }));
  }

  return items.filter((item) => {
    const haystack = [item.name, item.category, item.discount, item.conditions, item.city, item.state]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  }).slice(0, 50).map((r) => ({ ...r, source: 'local' }));
}

module.exports = {
  initializeDatabase,
  saveLocalBusiness,
  getVerifiedLocalBusinesses,
};
