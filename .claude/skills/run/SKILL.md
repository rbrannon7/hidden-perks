---
name: run
description: Launches the HiddenPerks Express server and drives the frontend (public/index.html, app.js, style.css) in a headless browser, for visually verifying UI/CSS changes with a screenshot. Use whenever asked to run, preview, or screenshot the app, or to confirm a frontend change actually renders correctly.
---

# Running HiddenPerks

This is a single Node/Express app — no separate frontend build step.
`server.js` serves the static files in `public/` *and* the `/api/*`
routes, so always run the real server rather than a plain static file
server — otherwise search results and the "Ask For Me" flow have
nothing to fetch from.

## Launch

```bash
cd "c:/Users/Rob/Documents/Computing/Python/hidden-perks"
node server.js > /tmp/server.log 2>&1 &
echo $! > /tmp/hp-server.pid
# poll, don't sleep-and-hope
for i in $(seq 1 20); do curl -sf http://localhost:3000/index.html >/dev/null && break; sleep 0.5; done
```

Default port is 3000 (`PORT` env var overrides). No `.env` / API key is
required for the core search + Ask-For-Me flow — `ANTHROPIC_API_KEY`
is only needed for the admin "Fetch Details" button (`IS_ADMIN` /
`localStorage.hp_admin`), which you won't hit in a normal UI check.

Stop with `kill $(cat /tmp/hp-server.pid)` (or `pkill -f "node server.js"`)
before relaunching, or the next run hits `EADDRINUSE`.

## Drive it with Playwright

There's no `chromium-cli` or project-local Playwright install on this
Windows machine, and `npm install playwright` / `npx playwright` may
try to hit the network. Reuse the existing global Playwright install
left in the OS temp folder instead:

```bash
cd /c/Users/Rob/AppData/Local/Temp   # this dir has node_modules/playwright already
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 420, height: 900 }); // phone-sized — this is a mobile-first senior-facing app
  await page.goto('http://localhost:3000/index.html');

  // example: search -> open a result -> Share Discount -> Show to Cashier
  await page.fill('#queryInput', \"denny's\");
  await page.click('#searchForm button[type=submit]');
  await page.waitForSelector('.btn-ask');
  await page.click('.btn-ask');
  await page.waitForSelector('#askModal:not([hidden])');
  await page.click('#btnShow');
  await page.waitForSelector('#showMode:not([hidden])');

  await page.screenshot({ path: 'C:/tmp/pw-check/screenshot.png' });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
"
```

Then view the result with the Read tool on `C:/tmp/pw-check/screenshot.png`
— don't skip this, a blank or error-page screenshot means the flow
didn't actually work.

If that temp Playwright install is ever gone (it can be cleared), fall
back to `npx playwright install chromium && npx playwright ...` — it
will download a browser binary, which takes a minute and needs network
access.

## Key elements for common flows

- Search: `#queryInput`, `#categoryFilter`, `#zipInput`, submit via `#searchForm`
- Result card "Share Discount" button: `.btn-ask` (one per card)
- Ask For Me modal: `#askModal`, script text in `#askScript`, actions `#btnShow` / `#btnCopy` / `#btnText`
- Full-screen cashier view: `#showMode`, content in `#showScript`, back button `#closeShow`
- Submission form: `#submitForm` with fields like `#submitDiscount`, `#submitConditions`, `#submitEmail`

## Gotchas

- The cashier-facing `#showMode` view is meant to be read by an actual
  cashier at a register, in bright light — when checking changes there,
  look at contrast and font size, not just that it renders.
- `console --errors`-equivalent: pass `page.on('console', ...)` and
  check for errors before declaring success — a page can render its
  shell while a fetch to `/api/search` fails silently.
