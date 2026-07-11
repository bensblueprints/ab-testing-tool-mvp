import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Flag, Code2, LogOut, Plus, Trash2, Copy, Check, X, Play, Pause,
  Trophy, BarChart3, ChevronDown, ChevronUp
} from 'lucide-react';
import { api, timeAgo } from './api.js';

const card = 'bg-zinc-900/70 border border-zinc-800 rounded-2xl';
const input = 'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500';
const btn = 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors';
const btnPrimary = `${btn} bg-sky-600 hover:bg-sky-500 text-white`;
const btnGhost = `${btn} bg-zinc-800 hover:bg-zinc-700 text-zinc-200`;
const statusColors = {
  draft: 'bg-zinc-700/40 text-zinc-400', running: 'bg-emerald-500/15 text-emerald-400',
  paused: 'bg-amber-500/15 text-amber-400', completed: 'bg-sky-500/15 text-sky-300'
};

function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="text-zinc-400 hover:text-sky-400 p-1" title="Copy"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); })}>
      {ok ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-8 w-full max-w-sm`}
        onSubmit={async (e) => {
          e.preventDefault();
          try { await api.login(pw); onDone(); } catch { setErr('Wrong password'); }
        }}>
        <div className="flex items-center gap-2 mb-1 text-sky-400"><FlaskConical /><span className="text-xl font-black text-white">Splitpoint</span></div>
        <p className="text-zinc-500 text-sm mb-6">A/B testing & feature flags you own. Sign in.</p>
        <input className={input} type="password" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {err && <p className="text-red-400 text-xs mt-2">{err}</p>}
        <button className={`${btnPrimary} w-full justify-center mt-4`}>Sign in</button>
      </motion.form>
    </div>
  );
}

function ExperimentModal({ onClose, onSaved }) {
  const [f, setF] = useState({
    key: '', name: '', traffic_pct: 100, goal_type: 'event', goal_value: '',
    exclusion_group: '', targeting: { url_match: '', device: '' },
    variants: [{ name: 'control', weight: 50, is_control: true }, { name: 'variant-b', weight: 50 }]
  });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setVar = (i, k, v) => setF((p) => {
    const variants = p.variants.map((va, j) => (j === i ? { ...va, [k]: v } : va));
    return { ...p, variants };
  });
  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className={`${card} p-6 w-full max-w-lg max-h-[90vh] overflow-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold">New experiment</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input className={input} placeholder="key (e.g. pricing_test)" value={f.key}
              onChange={(e) => set('key', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} />
            <input className={input} placeholder="Display name" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Variants & traffic weights</label>
            {f.variants.map((v, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <input className={input} value={v.name} onChange={(e) => setVar(i, 'name', e.target.value)} />
                <input className={`${input} w-24`} type="number" min="1" value={v.weight} onChange={(e) => setVar(i, 'weight', Number(e.target.value))} />
                {v.is_control
                  ? <span className="text-[10px] font-bold text-sky-400 w-16">CONTROL</span>
                  : <button className="text-zinc-500 hover:text-red-400 w-16" onClick={() => set('variants', f.variants.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
              </div>
            ))}
            <button className="text-xs text-sky-400 hover:underline" onClick={() =>
              set('variants', [...f.variants, { name: `variant-${String.fromCharCode(98 + f.variants.length)}`, weight: 50 }])}>
              + add variant
            </button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Traffic %</label>
              <input className={input} type="number" min="1" max="100" value={f.traffic_pct} onChange={(e) => set('traffic_pct', Number(e.target.value))} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Goal</label>
              <select className={input} value={f.goal_type} onChange={(e) => set('goal_type', e.target.value)}>
                <option value="event">JS track() event</option>
                <option value="url">Pageview URL match</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">{f.goal_type === 'event' ? 'Event name' : 'URL contains'}</label>
              <input className={input} placeholder={f.goal_type === 'event' ? 'signup' : '/thank-you'} value={f.goal_value} onChange={(e) => set('goal_value', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Target URL contains (optional)</label>
              <input className={input} placeholder="/pricing" value={f.targeting.url_match} onChange={(e) => set('targeting', { ...f.targeting, url_match: e.target.value })} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Device</label>
              <select className={input} value={f.targeting.device} onChange={(e) => set('targeting', { ...f.targeting, device: e.target.value })}>
                <option value="">Any</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Exclusion group (optional)</label>
              <input className={input} placeholder="homepage" value={f.exclusion_group} onChange={(e) => set('exclusion_group', e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">Experiments sharing an exclusion group never run on the same visitor — no cross-contamination.</p>
        </div>
        {err && <p className="text-red-400 text-xs mt-2">{err}</p>}
        <button className={`${btnPrimary} w-full justify-center mt-5`} onClick={async () => {
          try { onSaved(await api.createExperiment(f)); } catch (e) { setErr(e.message); }
        }}>Create (as draft)</button>
      </motion.div>
    </div>
  );
}

function Results({ exp }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.results(exp.id).then(setData).catch(() => {}); }, [exp.id]);
  if (!data) return null;
  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-zinc-500">
          <th className="p-2">Variant</th><th className="p-2">Visitors</th><th className="p-2">Conversions</th>
          <th className="p-2">CR</th><th className="p-2">95% CI</th><th className="p-2">Lift</th><th className="p-2">Confidence</th><th className="p-2"></th>
        </tr></thead>
        <tbody>
          {data.results.map((r) => (
            <tr key={r.id} className={`border-t border-zinc-800/50 ${data.experiment.winner_variant_id === r.id ? 'bg-sky-500/5' : ''}`}>
              <td className="p-2 font-semibold">
                {r.name}
                {Boolean(r.is_control) && <span className="ml-2 text-[10px] text-sky-400 font-bold">CONTROL</span>}
                {data.experiment.winner_variant_id === r.id && <Trophy size={13} className="inline ml-2 text-amber-400" />}
              </td>
              <td className="p-2">{r.visitors}</td>
              <td className="p-2">{r.conversions}</td>
              <td className="p-2 font-bold">{r.conversion_rate}%</td>
              <td className="p-2 text-zinc-500 text-xs">{r.ci[0]}–{r.ci[1]}%</td>
              <td className="p-2">{r.vs_control ? (
                <span className={r.vs_control.lift_pct > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {r.vs_control.lift_pct != null ? `${r.vs_control.lift_pct > 0 ? '+' : ''}${r.vs_control.lift_pct}%` : '—'}
                </span>) : '—'}</td>
              <td className="p-2">{r.vs_control ? (
                <span className={r.vs_control.significant ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                  {r.vs_control.confidence}%{r.vs_control.significant && ' ✓'}
                </span>) : '—'}</td>
              <td className="p-2">
                {data.experiment.status !== 'completed' && (
                  <button className="text-xs text-amber-400 hover:underline" onClick={async () => {
                    if (confirm(`Declare "${r.name}" the winner and complete the experiment?`)) {
                      await api.declareWinner(exp.id, r.id);
                      setData(await api.results(exp.id));
                    }
                  }}>declare winner</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-zinc-600 mt-2">Two-proportion z-test vs control · significant at 95% confidence (p &lt; 0.05). Don't stop early — decide sample size first.</p>
    </div>
  );
}

function Experiments() {
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(false);
  const [open, setOpen] = useState(null);
  const load = () => api.experiments().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold text-lg">Experiments</h2>
        <button className={btnPrimary} onClick={() => setModal(true)}><Plus size={16} />New experiment</button>
      </div>
      <div className="grid gap-3">
        {rows?.length === 0 && <div className={`${card} p-8 text-center text-zinc-500`}>No experiments yet. Create one, start it, and drop the SDK on your site.</div>}
        {rows?.map((e) => (
          <motion.div layout key={e.id} className={`${card} p-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-44">
                <div className="font-semibold flex items-center gap-2">
                  {e.name}
                  <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${statusColors[e.status]}`}>{e.status.toUpperCase()}</span>
                </div>
                <div className="text-xs text-zinc-500 font-mono">{e.key} · {e.variants.length} variants · {e.traffic_pct}% traffic
                  {e.exclusion_group && ` · group:${e.exclusion_group}`} · goal: {e.goal_type === 'event' ? `track('${e.goal_value}')` : `url ~ ${e.goal_value}`}</div>
              </div>
              <div className="flex gap-4 text-center text-xs">
                <div><div className="font-bold text-sm">{e.visitors}</div><div className="text-zinc-500">visitors</div></div>
                <div><div className="font-bold text-sm text-emerald-400">{e.conversions}</div><div className="text-zinc-500">conversions</div></div>
              </div>
              <div className="flex gap-1">
                {e.status === 'running'
                  ? <button className="p-2 text-zinc-400 hover:text-amber-400" title="Pause" onClick={async () => { await api.setStatus(e.id, 'paused'); load(); }}><Pause size={15} /></button>
                  : e.status !== 'completed' && <button className="p-2 text-zinc-400 hover:text-emerald-400" title="Start" onClick={async () => { await api.setStatus(e.id, 'running'); load(); }}><Play size={15} /></button>}
                <button className="p-2 text-zinc-400 hover:text-sky-400" title="Results" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  {open === e.id ? <ChevronUp size={15} /> : <BarChart3 size={15} />}
                </button>
                <button className="p-2 text-zinc-400 hover:text-red-400" title="Delete" onClick={async () => {
                  if (confirm(`Delete ${e.name} and all its data?`)) { await api.deleteExperiment(e.id); load(); }
                }}><Trash2 size={15} /></button>
              </div>
            </div>
            {open === e.id && <Results exp={e} />}
          </motion.div>
        ))}
      </div>
      <AnimatePresence>
        {modal && <ExperimentModal onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

function Flags() {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ key: '', name: '', rollout_pct: 100 });
  const load = () => api.flags().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <div>
      <h2 className="font-bold text-lg mb-4">Feature flags</h2>
      <div className={`${card} p-4 mb-4 flex flex-wrap gap-2 items-end`}>
        <div className="flex-1 min-w-36">
          <label className="text-xs text-zinc-500 block mb-1">Key</label>
          <input className={input} placeholder="dark_mode" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} />
        </div>
        <div className="flex-1 min-w-36">
          <label className="text-xs text-zinc-500 block mb-1">Name</label>
          <input className={input} placeholder="Dark mode" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="w-28">
          <label className="text-xs text-zinc-500 block mb-1">Rollout %</label>
          <input className={input} type="number" min="0" max="100" value={f.rollout_pct} onChange={(e) => setF({ ...f, rollout_pct: Number(e.target.value) })} />
        </div>
        <button className={btnPrimary} onClick={async () => {
          if (!f.key) return;
          await api.createFlag(f); setF({ key: '', name: '', rollout_pct: 100 }); load();
        }}><Plus size={16} />Create</button>
      </div>
      <div className="grid gap-2">
        {rows?.length === 0 && <div className={`${card} p-8 text-center text-zinc-500`}>No flags yet. Same infra as experiments — % rollout, no goal tracking. Perfect for gradual releases.</div>}
        {rows?.map((fl) => (
          <div key={fl.id} className={`${card} p-4 flex flex-wrap items-center gap-3`}>
            <Flag size={16} className={fl.enabled ? 'text-emerald-400' : 'text-zinc-600'} />
            <div className="flex-1">
              <div className="font-semibold text-sm">{fl.name || fl.key}</div>
              <div className="text-xs font-mono text-zinc-500">splitpoint.isEnabled('{fl.key}')</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              rollout
              <input className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1" type="number" min="0" max="100"
                defaultValue={fl.rollout_pct}
                onBlur={async (e) => { await api.updateFlag(fl.id, { rollout_pct: Number(e.target.value) }); load(); }} />%
            </div>
            <button className={`${btn} text-xs px-3 py-1.5 ${fl.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}
              onClick={async () => { await api.updateFlag(fl.id, { enabled: !fl.enabled }); load(); }}>
              {fl.enabled ? 'ON' : 'OFF'}
            </button>
            <button className="p-2 text-zinc-400 hover:text-red-400" onClick={async () => { await api.deleteFlag(fl.id); load(); }}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Setup() {
  const base = window.location.origin;
  const snippet = `<script src="${base}/sp.js"></script>`;
  const usage = `splitpoint.ready(function () {
  var v = splitpoint.getVariant('pricing_test'); // 'control' | 'variant-b' | null
  if (v === 'variant-b') document.body.classList.add('new-pricing');
  if (splitpoint.isEnabled('dark_mode')) enableDarkMode();
});
// on conversion:
splitpoint.track('signup');`;
  const react = `import { useEffect, useState } from 'react';

export function useVariant(key) {
  const [variant, setVariant] = useState(null);
  useEffect(() => {
    window.splitpoint?.ready(() => setVariant(window.splitpoint.getVariant(key)));
  }, [key]);
  return variant; // null until assigned
}

// <PricingPage /> — code-level test:
// const v = useVariant('pricing_test');
// if (v === 'variant-b') return <NewPricing />;`;
  return (
    <div className="max-w-2xl">
      <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Code2 size={18} className="text-sky-400" />Setup</h2>
      <div className={`${card} p-5 mb-4`}>
        <div className="text-sm font-bold mb-2">1 — Add the SDK (any site, &lt;3KB)</div>
        <div className="bg-zinc-800 rounded-lg p-3 font-mono text-xs flex justify-between items-start gap-2">
          <span>{snippet}</span><CopyBtn text={snippet} />
        </div>
      </div>
      <div className={`${card} p-5 mb-4`}>
        <div className="text-sm font-bold mb-2">2 — Use variants & flags</div>
        <div className="bg-zinc-800 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap flex justify-between items-start gap-2">
          <span>{usage}</span><CopyBtn text={usage} />
        </div>
      </div>
      <div className={`${card} p-5`}>
        <div className="text-sm font-bold mb-2">React hook wrapper</div>
        <div className="bg-zinc-800 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap flex justify-between items-start gap-2">
          <span>{react}</span><CopyBtn text={react} />
        </div>
        <p className="text-[11px] text-zinc-500 mt-3">
          Assignments are deterministic (FNV-1a of visitor id + experiment key) and cached in localStorage — sticky across visits, no flicker on repeat views. Goals only count for visitors actually in the experiment.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [tab, setTab] = useState('experiments');
  useEffect(() => { api.me().then((r) => setAuthed(r.authed)).catch(() => setAuthed(false)); }, []);
  if (authed === null) return null;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  const tabs = [
    ['experiments', 'Experiments', FlaskConical],
    ['flags', 'Feature flags', Flag],
    ['setup', 'Setup', Code2]
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800/70 sticky top-0 bg-zinc-950/80 backdrop-blur z-30">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 text-sky-400"><FlaskConical size={20} /><span className="font-black text-white">Splitpoint</span></div>
          <nav className="flex gap-1 flex-1">
            {tabs.map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${tab === id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </nav>
          <button className="text-zinc-500 hover:text-white" title="Sign out" onClick={async () => { await api.logout(); setAuthed(false); }}><LogOut size={16} /></button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {tab === 'experiments' && <Experiments />}
        {tab === 'flags' && <Flags />}
        {tab === 'setup' && <Setup />}
      </main>
    </div>
  );
}
