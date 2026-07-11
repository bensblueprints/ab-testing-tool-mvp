// The client SDK, served at GET /sp.js. Vanilla JS, no dependencies, well
// under 3KB gzipped. Never writes to the DOM (nothing to XSS).
//
//   <script src="https://your-splitpoint-host/sp.js"></script>
//   <script>
//     splitpoint.ready(function () {
//       var v = splitpoint.getVariant('pricing_test');   // 'control' | 'variant-b' | null
//       if (v === 'variant-b') document.body.classList.add('new-pricing');
//       if (splitpoint.isEnabled('dark_mode')) { ... }   // feature flag
//     });
//     // on conversion:
//     splitpoint.track('signup');
//   </script>
//
// Assignment is deterministic client-side: FNV-1a(visitorId + expKey) → bucket.
// Sticky by construction (same visitor id → same bucket, plus a localStorage
// cache so a config change never reshuffles existing visitors).
module.exports = String.raw`(function () {
  'use strict';
  if (window.splitpoint) return;

  var script = document.currentScript || (function () {
    var s = document.querySelectorAll('script[src*="sp.js"]');
    return s[s.length - 1];
  })();
  var origin = '';
  try { origin = new URL(script.getAttribute('src'), location.href).origin; } catch (e) {}

  function fnv(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h / 4294967296; // 0..1
  }

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var vid = store('sp_vid');
  if (!vid) {
    vid = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    store('sp_vid', vid);
  }

  var cfg = null;
  var readyCbs = [];
  var assignments = {};
  try { assignments = JSON.parse(store('sp_assign') || '{}'); } catch (e) {}

  function beacon(payload) {
    var body = JSON.stringify(payload);
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon(origin + '/collect', body))) {
        fetch(origin + '/collect', { method: 'POST', body: body, keepalive: true });
      }
    } catch (e) {}
  }

  function matches(exp) {
    var t = exp.targeting || {};
    if (t.url_match && location.pathname.indexOf(t.url_match) === -1) return false;
    if (t.device === 'mobile' && window.innerWidth >= 768) return false;
    if (t.device === 'desktop' && window.innerWidth < 768) return false;
    return true;
  }

  function assign(exp) {
    if (assignments[exp.key]) return assignments[exp.key];
    if (!matches(exp)) return null;
    // mutual exclusion: one experiment per group per visitor
    if (exp.exclusion_group && cfg) {
      var group = cfg.experiments.filter(function (e) { return e.exclusion_group === exp.exclusion_group; });
      if (group.length > 1) {
        var idx = Math.floor(fnv(vid + '|xg|' + exp.exclusion_group) * group.length);
        if (group[idx].key !== exp.key) return null;
      }
    }
    if (fnv(vid + '|traffic|' + exp.key) * 100 >= exp.traffic_pct) return null; // held out
    var total = 0, i;
    for (i = 0; i < exp.variants.length; i++) total += exp.variants[i].weight;
    var roll = fnv(vid + '|' + exp.key) * total;
    var acc = 0, chosen = exp.variants[0];
    for (i = 0; i < exp.variants.length; i++) {
      acc += exp.variants[i].weight;
      if (roll < acc) { chosen = exp.variants[i]; break; }
    }
    assignments[exp.key] = chosen.name;
    store('sp_assign', JSON.stringify(assignments));
    beacon({ type: 'assignment', exp: exp.key, variant: chosen.name, vid: vid });
    return chosen.name;
  }

  function init(data) {
    cfg = data;
    (cfg.experiments || []).forEach(function (exp) {
      assign(exp);
      // pageview-URL goals fire automatically
      if (exp.goal_type === 'url' && exp.goal_value && location.pathname.indexOf(exp.goal_value) !== -1 && assignments[exp.key]) {
        beacon({ type: 'goal', exp: exp.key, vid: vid });
      }
    });
    readyCbs.forEach(function (cb) { try { cb(); } catch (e) {} });
    readyCbs = [];
  }

  window.splitpoint = {
    vid: function () { return vid; },
    ready: function (cb) { if (cfg) cb(); else readyCbs.push(cb); },
    getVariant: function (key) { return assignments[key] || null; },
    isEnabled: function (flagKey) {
      if (!cfg) return false;
      var f = (cfg.flags || []).filter(function (x) { return x.key === flagKey; })[0];
      if (!f || !f.enabled) return false;
      return fnv(vid + '|flag|' + flagKey) * 100 < f.rollout_pct;
    },
    track: function (goalName) {
      if (!cfg) { readyCbs.push(function () { window.splitpoint.track(goalName); }); return; }
      (cfg.experiments || []).forEach(function (exp) {
        if (exp.goal_type === 'event' && exp.goal_value === goalName && assignments[exp.key]) {
          beacon({ type: 'goal', exp: exp.key, vid: vid });
        }
      });
    }
  };

  var xhr = new XMLHttpRequest();
  xhr.open('GET', origin + '/api/sdk/config', true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;
    var data = { experiments: [], flags: [] };
    try { data = JSON.parse(xhr.responseText); } catch (e) {}
    init(data);
  };
  xhr.send();
})();`;
