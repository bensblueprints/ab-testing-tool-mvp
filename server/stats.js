// Two-proportion z-test for variant-vs-control conversion rates.
// Returns z, two-tailed p-value, and confidence (1 - p) — the classic
// "is this lift real or noise" number every A/B dashboard shows.

// Abramowitz & Stegun 7.1.26 erf approximation (|error| < 1.5e-7).
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// n1/c1 = control visitors/conversions, n2/c2 = variant.
function twoProportionZTest(n1, c1, n2, c2) {
  if (n1 === 0 || n2 === 0) return { z: 0, p_value: 1, confidence: 0, significant: false };
  const p1 = c1 / n1;
  const p2 = c2 / n2;
  const pPool = (c1 + c2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, p_value: 1, confidence: 0, significant: false };
  const z = (p2 - p1) / se;
  const p_value = 2 * (1 - normalCdf(Math.abs(z)));
  return {
    z: Math.round(z * 1000) / 1000,
    p_value: Math.round(p_value * 10000) / 10000,
    confidence: Math.round((1 - p_value) * 1000) / 10,   // %
    significant: p_value < 0.05
  };
}

// 95% CI for a single proportion (Wald with a floor at [0,1]).
function proportionCi(n, c) {
  if (n === 0) return [0, 0];
  const p = c / n;
  const half = 1.96 * Math.sqrt((p * (1 - p)) / n);
  return [Math.max(0, Math.round((p - half) * 10000) / 100), Math.min(100, Math.round((p + half) * 10000) / 100)];
}

module.exports = { twoProportionZTest, proportionCi, normalCdf };
