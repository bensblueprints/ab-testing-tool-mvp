async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body != null ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => req('/api/me'),
  login: (password) => req('/api/login', { method: 'POST', body: { password } }),
  logout: () => req('/api/logout', { method: 'POST' }),
  experiments: () => req('/api/experiments'),
  createExperiment: (body) => req('/api/experiments', { method: 'POST', body }),
  updateExperiment: (id, body) => req(`/api/experiments/${id}`, { method: 'PUT', body }),
  setStatus: (id, status) => req(`/api/experiments/${id}/status`, { method: 'POST', body: { status } }),
  declareWinner: (id, variant_id) => req(`/api/experiments/${id}/winner`, { method: 'POST', body: { variant_id } }),
  deleteExperiment: (id) => req(`/api/experiments/${id}`, { method: 'DELETE' }),
  results: (id) => req(`/api/experiments/${id}/results`),
  flags: () => req('/api/flags'),
  createFlag: (body) => req('/api/flags', { method: 'POST', body }),
  updateFlag: (id, body) => req(`/api/flags/${id}`, { method: 'PUT', body }),
  deleteFlag: (id) => req(`/api/flags/${id}`, { method: 'DELETE' })
};

export function timeAgo(ms) {
  if (!ms) return 'never';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
