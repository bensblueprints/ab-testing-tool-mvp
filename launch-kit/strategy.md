# Splitpoint — Launch Strategy

## Target communities

- **r/SaaS / Indie Hackers** — angle: "you don't need VWO until you have a CRO team; here's the $49 version of the 90% you actually use." Show the results table screenshot.
- **r/selfhosted** — angle: one Express process + SQLite, deterministic client-side bucketing, MIT. This sub loves "no external calls in the hot path."
- **r/webdev** — angle: teach deterministic assignment (FNV-1a hashing, why localStorage stickiness kills flicker) and link at the end.
- **r/statistics / r/AskStatistics** — do NOT promote; lurk for credibility. If discussing, be precise about the pooled z-test and peeking.
- **r/ExperiencedDevs / HN comments on feature-flag threads** — flags with % rollout as the wedge: "same hashing, zero extra infra."

## Hacker News — Show HN draft

**Title:** Show HN: Splitpoint — self-hosted A/B testing and feature flags (Express + SQLite)

A/B testing SaaS prices like enterprise software, but the mechanism is a deterministic hash and a two-proportion z-test. Splitpoint is that, self-hosted: experiments with weighted variants, traffic holdout, URL/device targeting, mutual-exclusion groups; a <3KB dependency-free SDK with sticky client-side assignment (FNV-1a of visitor+key — no assignment server in the hot path, no flicker); goals via track() or URL match; results with p-values, confidence, CIs and relative lift.

Design notes for the comments section: assignment is client-side and therefore spoofable — fine for marketing CRO, wrong for billing gates (use the flags from your backend for that). Goals only count for visitors with an assignment row, and duplicate assignments are structurally impossible (UNIQUE constraint). The dashboard nags you about peeking. MIT source; the paid product is a packaged installer.

## SEO keywords (10)

1. vwo alternative
2. optimizely alternative self hosted
3. ab testing tool open source
4. self hosted ab testing
5. feature flag self hosted free
6. ab testing software one time purchase
7. split testing tool small business
8. javascript ab testing sdk lightweight
9. launchdarkly alternative cheap
10. conversion rate optimization tool self hosted

## AppSumo / PitchGround pitch

Splitpoint gives every SaaS and agency the core experimentation loop — A/B tests with weighted traffic splits, a <3KB no-flicker SDK, conversion goals, and statistician-approved significance reporting (z-test, p-value, confidence, lift) — plus feature flags with percentage rollout on the same infrastructure. Self-hosted on any $5 VPS or as a Windows desktop app, with unlimited visitors and experiments because there's nothing to meter. The category charges $199–$999/mo on traffic tiers; a lifetime license here is an instant no-brainer for anyone who ships variants in code.

## Price math

**$49 one-time** vs VWO $199/mo → pays for itself in **8 days**. Three years of VWO = $7,164. Splitpoint = $49 (146× cheaper). vs LaunchDarkly starter ($10/seat/mo, 5 seats) → **1 month**.
