# 🧪 Splitpoint — A/B testing & feature flags you own forever

## Demo



https://github.com/user-attachments/assets/867ea4b8-bbe5-4f3a-a173-fa6a4a0d723c



![MIT License](https://img.shields.io/badge/license-MIT-green.svg)

Self-hosted A/B testing: define experiments and traffic splits, assign visitors with a <3KB JS SDK, track conversion goals, and read results with a proper two-proportion z-test. Feature flags with % rollout ride the same infrastructure.

**Pay once. Own it forever. No subscription.** VWO is $199/mo. Optimizely is "talk to sales." Splitpoint is **$49 once**.

![Screenshot](docs/screenshot.png)

## Features

- **Experiments** — control + N variants, weighted traffic split, traffic % holdout, URL/device targeting
- **Goals two ways** — a JS `splitpoint.track('signup')` call, or automatic pageview-URL-match conversion (`/thank-you`)
- **Tiny SDK** — vanilla JS, <3KB, no dependencies, never touches the DOM. `splitpoint.getVariant('key')` returns the assigned variant, sticky via deterministic hashing + localStorage (no flicker, no reshuffles)
- **React hook wrapper** included for code-level tests
- **Results that mean something** — visitors/conversions/CR per variant, 95% CI, relative lift, two-proportion z-test with p-value and confidence, "declare winner" workflow
- **Feature-flag mode** — boolean flags with % rollout on the same deterministic hashing; use it for gradual releases with zero extra setup
- **Mutual exclusion groups** — experiments sharing a group never run on the same visitor, so overlapping tests don't contaminate each other
- **Honest counting** — goals only count for visitors actually assigned; duplicate assignments are impossible (DB unique constraint)

## Quick start

```bash
npm i
npm run build
npm start       # http://localhost:5353  (admin password: "admin" until you set one)
```

On your site:

```html
<script src="https://your-splitpoint-host/sp.js"></script>
<script>
  splitpoint.ready(function () {
    if (splitpoint.getVariant('pricing_test') === 'variant-b') {
      document.body.classList.add('new-pricing');
    }
    if (splitpoint.isEnabled('dark_mode')) enableDarkMode();
  });
  // on conversion:
  splitpoint.track('signup');
</script>
```

**Desktop mode:** `npm run desktop` — same app as a Windows desktop app, auto-logged-in. Run it as a desktop app, or deploy to a $5 VPS when you need it public.

**Docker:** `docker compose up -d`.

## vs VWO

| | Splitpoint | VWO |
|---|---|---|
| Price | **$49 once** | $199+/mo (traffic-tiered) |
| Visitors | Unlimited | Plan-capped |
| A/B experiments + significance | ✅ z-test, CI, lift | ✅ |
| Feature flags + % rollout | ✅ | Higher tiers |
| Mutual exclusion groups | ✅ | ✅ |
| Data location | Your server | Their cloud |
| Visual WYSIWYG editor, heatmaps, ML targeting | ❌ | ✅ |

VWO is a full CRO suite. If your team point-and-clicks page variants, buy it. If your team ships variants in code and needs trustworthy numbers — that's Splitpoint.

## Statistics, honestly

Splitpoint runs a two-proportion z-test (pooled) against control and reports the two-tailed p-value, confidence, and Wald 95% CI per variant. Standard caveats apply: fix your sample size before you start, don't peek-and-stop at the first p < 0.05, and remember 95% confidence means 1 in 20 "winners" is noise.

## ☕ Skip the setup — get the 1-click installer

Source is MIT, forever. Prefer a packaged Windows installer with updates? **[Get Splitpoint on Whop →](https://whop.com/benjisaiempire/splitpoint)**

## Tech stack

Node 20+ · Express · better-sqlite3 · React 18 · Vite · Tailwind 4 · Framer Motion · Lucide · vanilla-JS SDK (FNV-1a deterministic bucketing) · Electron (desktop mode)

## License

MIT © 2026 Ben (bensblueprints)

## macOS build

See [MAC-BUILD.md](MAC-BUILD.md). Quickest path: GitHub **Actions** tab -> run the **Mac Build** (`mac-build.yml`) workflow to get a downloadable `.dmg` (unsigned - right-click -> Open on first launch).
