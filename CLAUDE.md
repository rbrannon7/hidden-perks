# HiddenPerks — Claude Code Handoff

## What Is This Project?

**HiddenPerks** is a web app that helps senior citizens (55+) quickly find senior discounts at businesses — both national chains and local businesses. The core insight is that most businesses offer senior discounts but never advertise them. Cashiers are trained to apply them only when asked.

The app's key differentiator is the **"Ask For Me"** feature: after finding a discount, the user taps a button and gets a ready-to-show card with the exact words to say (or show on their phone) at the register.

**Tagline:** *"The perks businesses don't advertise."*

---

## Target User

Senior citizens age 55+. UX must prioritize:
- Large, readable text
- High contrast
- Minimal clicks to get to a result
- No login required to search
- Mobile-friendly (many users will be on phones in-store)

---

## Core Features (POC Scope)

1. **Search** — by business name or category (e.g., "pizza", "hardware", "grocery")
2. **Location** — "Near Me" via browser geolocation OR manual ZIP code entry
3. **Results cards** — show business name, discount description, age requirement, conditions
4. **Ask For Me button** — generates a plain-English script the user can show, copy, text to themselves, or print
5. **User submission form** — let users submit a local business discount they've discovered (goes into a pending/review queue)

---

## Data Architecture

### National Chains (Static JSON)
File: `data/national-chains.json`

Start with manually curated data pulled from SeniorLiving.org and TheSeniorList.com.

Each record:
```json
{
  "id": "dennys-001",
  "name": "Denny's",
  "category": "restaurant",
  "discount": "15% off dine-in and pickup orders",
  "ageRequirement": 55,
  "conditions": "No AARP membership required",
  "sourceUrl": "https://www.theseniorlist.com/senior-discounts/",
  "national": true
}
```

### Local Businesses (Database)
Use **SQLite** via `better-sqlite3` npm package for POC. One table:

```sql
CREATE TABLE local_businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  category TEXT,
  discount TEXT NOT NULL,
  age_requirement INTEGER,
  conditions TEXT,
  submitted_by TEXT,
  verified INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Only `verified = 1` records are shown to users. Rob reviews and approves submissions manually at POC stage.

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | Single HTML file or simple React | Keep it simple |
| Backend | Node.js + Express | Rob's existing stack |
| Database | SQLite (`better-sqlite3`) | Single `.db` file, no server needed |
| Geolocation | Browser `navigator.geolocation` | For "Near Me" |
| Hosting | Render.com | Rob's existing deployment setup |
| Deploy | GitHub auto-deploy | Rob's existing workflow |

---

## The "Ask For Me" Feature — Detail

When a user taps "Ask For Me" on a result card, generate a card like:

> *"Hi! I'd love to use my senior discount today. I understand [Business Name] offers [discount description] for customers [age requirement]+. Thank you so much!"*

The card should offer three options:
- **Show** — displays full-screen on the phone for the cashier to read
- **Copy** — copies text to clipboard
- **Text to Myself** — opens SMS with pre-filled message (use `sms:` URI)

---

## File Structure (Target)

```
hiddenperks/
├── CLAUDE.md               ← this file
├── package.json
├── server.js               ← Express backend
├── database.js             ← SQLite setup and queries
├── data/
│   └── national-chains.json
├── public/
│   ├── index.html          ← main frontend
│   ├── style.css
│   └── app.js
└── db/
    └── hiddenperks.db      ← SQLite database file
```

---

## Design Direction

The landing page mockup was built in a previous Claude chat session. Key design decisions:

- **Color palette:** Deep navy (`#1a1a2e`) + warm gold (`#c9a84c`) + cream background (`#faf7f2`)
- **Typography:** Playfair Display (display/headings) + Inter (body)
- **Tone:** Confident, positive — reframes aging as an advantage, not a category
- **No "senior" stigma** — the brand feels like a smart savings tool, not an old-person app

The landing page HTML file (`agesmart-landing.html`) was built with this palette and can be adapted for HiddenPerks. Note: the app was originally named **AgeSmart** during brainstorming — the final name is **HiddenPerks**.

---

## What to Build First

Suggested order:

1. Set up the project folder and `package.json`
2. Create `data/national-chains.json` with ~20 seed entries across categories (restaurants, retail, grocery, travel, entertainment)
3. Build the Express server with two endpoints:
   - `GET /api/search?q=dennys` — searches national chains JSON
   - `POST /api/submit` — saves a local business submission (unverified)
4. Build the frontend search UI with results cards
5. Wire up the Ask For Me button
6. Add the submission form

---

## What to Skip at POC Stage

- User accounts or login
- AI-powered verification of submissions
- Native mobile app (responsive web is fine)
- Ratings or reviews

---

## Monetization Plan — Local Sponsored Listings

**Strategy:** Businesses pay a monthly fee to appear at the top of search results for their category and ZIP area. Users see a "Featured" badge. Everything else stays free and unchanged for users.

**Why this model:**
- Businesses with senior discounts *want* seniors to find them — seniors are loyal customers, tip well, and shop during slow hours
- Restaurants (the biggest app category) can't do affiliate links but absolutely can do a sponsored listing
- Cheaper and more targeted than Yelp ads, Facebook ads, or Google ads for reaching local seniors

**Launch market: Cache County / Logan, Utah**
- Rob has prior connections here from a previous Cache County senior discount app
- Goal: get 100–200 real local monthly users first, then approach businesses in person
- Pitch to a business owner: "X seniors in Cache County searched for restaurant discounts last month — for $25/month your restaurant appears first"

**Pricing target:** $25–$40/month per sponsored business

**Implementation sequence:**
1. Build local Cache County user base first (share with senior center, local Facebook groups)
2. Manually offer 5 local businesses a free 30-day featured trial
3. Convert to paid at $25–$40/month after trial
4. Once proven, build self-serve signup + Stripe payment so businesses can pay without Rob's involvement
5. Expand to additional markets

**Code changes needed (when ready to build):**
- Add `featured` boolean field to the local businesses database table
- Add `featured` flag support to `national-chains.json` for any national chain that pays for placement
- Sort featured results to the top in `/api/search` and `/api/nearby`
- Add a "Featured" badge style to result cards in `app.js` and `style.css`

---

## AARP Affiliate Program (Pending Approval)

Rob applied to the AARP – US Affiliate Program through FlexOffers (flat $24 payout per AARP membership sale). Status as of application: pending approval. Once approved, implement the affiliate link as follows:

**Why this fits:** Many entries in the `online` category (and a few `travel` car rental entries — Avis, Hertz, Enterprise, National, Alamo) already require AARP membership to redeem. Surfacing an affiliate signup link on exactly those cards turns a dead-end ("you need AARP for this") into a monetizable action, on an audience that's already a great fit for AARP.

**Implementation plan (small, contained change):**
1. **Centralize the link** — store the FlexOffers tracking URL as a single constant in `app.js` (e.g. `AARP_AFFILIATE_URL`), not hardcoded into JSON entries. Affiliate links can change; one edit point beats hunting through `data/national-chains.json`.
2. **Add a real data field, not string-matching** — add `requiresAarp: true` to the ~15–20 entries that need AARP (the `online` category ones already say "AARP membership required:" in their conditions, plus the car rental entries). Don't have the render logic parse the conditions string — that's brittle if wording ever changes. Mirrors the existing `ageRequirement`/`national` field pattern.
3. **Show a real button, not an inline link** — add a secondary button next to "Share Discount" (e.g. "Join AARP") that only renders when `item.requiresAarp` is true. Matches the large-tap-target UX principle for 55+ users better than a small inline text link.
4. **One sitewide FTC disclosure, not per-card** — a short "(affiliate link)" note near the button is enough per-card; add one clear disclosure statement sitewide (footer or About section) to cover FTC affiliate marketing requirements.
5. **Track clicks via GoatCounter** (already wired into `public/index.html`) — tag the "Join AARP" button with a click event to measure conversion funnel before expanding the affiliate angle further.

---

## Working Autonomy

Rob has given standing authorization to run commands (git commit, git push, npm install, file edits, running the dev server, background agents, etc.) without stopping to ask "may I proceed?" first, as long as the action is within the scope of what Rob has already asked for. Do not pause for confirmation on routine steps of an in-progress task.

Still confirm first for genuinely high-risk/destructive actions: force-push, `git reset --hard`, deleting files/branches, dropping database tables/data, or anything else that's hard to reverse or affects shared state beyond this repo.

---

## Rob's Development Context

- **Stack familiarity:** Rob has built Node.js + Express backends before (Aqua Realms card game with WebSocket multiplayer on Render)
- **Preferred workflow:** Single-file HTML → iterative Claude chat refinement → VS Code + Claude Code → Render deploy via GitHub
- **New to:** SQLite and JSON databases — keep explanations clear, use comments in code
- **Editor:** VS Code with Claude Code extension
- **Hosting:** Render.com with GitHub auto-deploy already configured

---

## Future Feature Ideas (Post-POC)

- Crowdsourced discount submissions with community voting
- "Discount of the Day" push notification
- Filter by age bracket (55+, 60+, 65+)
- AARP vs. non-AARP discount toggle
- Business owner portal to self-submit and manage their listing
- Cache County, Utah local focus as a regional pilot (Rob already built a Cache County senior discount web app as a prior project)
