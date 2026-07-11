# Product Hunt Launch — Splitpoint

## Name
Splitpoint

## Tagline (60 chars)
Self-hosted A/B testing & feature flags. Pay once, not $199/mo.

## Description (260 chars)
A/B tests with a <3KB SDK: traffic splits, sticky assignment, conversion goals, two-proportion z-test with confidence & lift, declare-winner flow. Feature flags with % rollout on the same infra. Self-hosted Node+SQLite. $49 once vs VWO's $199/mo. MIT.

## Full description

"VWO is $199/mo for a coin flip and a chi-squared test." I said it as a joke, then checked the math and built Splitpoint.

- **Experiments** — control + N variants, weighted splits, traffic holdout, URL/device targeting
- **A <3KB SDK** — `splitpoint.getVariant('key')`, deterministic FNV-1a bucketing, sticky via localStorage: no flicker, no reshuffling, works for CSS/DOM swaps or code-level tests (React hook included)
- **Goals** — `splitpoint.track('signup')` or automatic thank-you-page URL match
- **Real statistics** — two-proportion z-test vs control, two-tailed p-value, confidence, relative lift, 95% CIs, and a declare-winner workflow
- **Feature flags** — boolean flags with % rollout on the same deterministic hashing; gradual releases for free
- **Mutual exclusion groups** — overlapping experiments never share a visitor
- **Honest counting** — duplicate assignments are impossible (DB constraint); goals only count for assigned visitors
- One Node process + SQLite, docker compose for a $5 VPS, or run as a Windows desktop app

MIT source. $49 gets the 1-click installer.

## Maker first comment

Hey PH 👋

I got tired of paying enterprise prices for what is, mechanically, `hash(visitor + experiment) % weights` plus a z-test. That's not a $2,400/yr product, that's an afternoon of statistics and a weekend of dashboard.

Honest notes:
- There's no visual editor. You ship variants in code or CSS. If your marketing team needs WYSIWYG, VWO is genuinely better for you.
- The stats are frequentist and boring on purpose: pooled two-proportion z-test, two-tailed p. The dashboard literally tells you not to peek-and-stop.
- Assignment happens client-side and deterministically, so there's no assignment-server latency and no flicker — the trade is that a malicious client can lie about its variant. For marketing-site CRO that's fine; for billing-grade gating use the flags server-side.

Ask me about exclusion groups, why goals require an assignment row, or p-hacking horror stories.

## Gallery shots (5)

1. **Results table** — variants with CR, CI, +120% lift, 99% confidence ✓, declare-winner button. Caption: "Numbers you can defend in the standup."
2. **Experiment builder** — variants + weights, targeting, goal picker. Caption: "Control + N variants, weighted how you like."
3. **Setup page** — the 1-line snippet + getVariant code + React hook. Caption: "Under 3KB. No flicker. Sticky."
4. **Feature flags** — rollout sliders, ON/OFF toggles. Caption: "Gradual releases on the same infra."
5. **Pricing math card** — "$49 once vs $2,388/yr VWO." Caption: "A coin flip shouldn't cost $199/mo."
