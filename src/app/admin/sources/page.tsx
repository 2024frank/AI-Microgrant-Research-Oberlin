'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { Plus, Play, ToggleLeft, ToggleRight, CheckCircle, XCircle, Loader } from 'lucide-react';

const SCHEDULE_OPTIONS = [
  { label: 'Every hour',   value: '0 * * * *' },
  { label: 'Every 6 hours',value: '0 */6 * * *' },
  { label: 'Daily (6am)',  value: '0 6 * * *' },
  { label: 'Daily (noon)', value: '0 12 * * *' },
  { label: 'Weekly',       value: '0 6 * * 1' },
];

export default function SourcesPage() {
  const [sources, setSources]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState({ name: '', agent_id: '', schedule_cron: '0 6 * * *' });
  const [adding, setAdding]       = useState(false);
  const [error, setError]         = useState('');
  const [triggering, setTriggering] = useState<number | null>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';

  function load() {
    fetch('/api/sources', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setSources).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function addSource() {
    setAdding(true); setError('');
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Failed'); setAdding(false); return; }
    setShowAdd(false); setForm({ name: '', agent_id: '', schedule_cron: '0 6 * * *' });
    load();
    setAdding(false);
  }

  async function triggerRun(sourceId: number) {
    setTriggering(sourceId);
    await fetch(`/api/agent/trigger/${sourceId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    setTriggering(null); load();
  }

  async function toggleActive(source: any) {
    await fetch(`/api/sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ active: source.active ? 0 : 1 }),
    });
    load();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f9fa' }}>
      <Sidebar role="admin" name="Admin" />

      <main style={{ flex: 1, padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Sources</h1>
            <p style={{ fontSize: 13, color: '#888' }}>One Claude agent per source org</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Plus size={15}/> Add source
          </button>
        </div>

        {loading ? <div style={{ color: '#888', fontSize: 14 }}>Loading…</div> : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #eee' }}>
                  {['Source', 'Agent ID', 'Schedule', 'Last run', 'Events', 'Approval', 'Active', ''].map(h => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '0.875rem 1rem', fontFamily: 'monospace', fontSize: 11, color: '#666' }}>{s.agent_id?.slice(0, 20)}…</td>
                    <td style={{ padding: '0.875rem 1rem', color: '#666' }}>
                      {SCHEDULE_OPTIONS.find(o => o.value === s.schedule_cron)?.label || s.schedule_cron}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#888', fontSize: 12 }}>
                      {s.last_run_at ? new Date(s.last_run_at).toLocaleDateString() : '—'}
                      {s.last_run_status && (
                        <span style={{ marginLeft: 6 }}>
                          {s.last_run_status === 'completed' ? <CheckCircle size={12} color="#3a8c3f"/> :
                           s.last_run_status === 'failed'    ? <XCircle size={12} color="#c0392b"/> :
                           <Loader size={12} color="#888"/>}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span style={{ fontWeight: 600 }}>{s.total_approved || 0}</span>
                      <span style={{ color: '#aaa' }}>/{s.total_events || 0}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      {s.total_events ? (
                        <span style={{ color: '#3a8c3f', fontWeight: 600 }}>
                          {Math.round((s.total_approved / s.total_events) * 100)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <button onClick={() => toggleActive(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.active ? '#3a8c3f' : '#ccc' }}>
                        {s.active ? <ToggleRight size={22}/> : <ToggleLeft size={22}/>}
                      </button>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <button onClick={() => triggerRun(s.id)} disabled={triggering === s.id || !s.active}
                        style={{ background: 'none', border: '1.5px solid #3a8c3f', borderRadius: 6, padding: '0.3rem 0.6rem', cursor: 'pointer', color: '#3a8c3f', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {triggering === s.id ? <Loader size={11}/> : <Play size={11}/>} Run now
                      </button>
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>No sources yet — add your first one</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add source modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: '1.75rem', width: '100%', maxWidth: 420 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Add source</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: '1.25rem' }}>
              Each source needs its own Claude agent. All agents share the same environment and vault.
            </p>

            {error && <div style={{ background: '#fdecea', color: '#c0392b', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: 12, marginBottom: '1rem' }}>{error}</div>}

            <label style={labelStyle}>Organization name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Apollo Theatre" style={{ ...inputStyle, marginBottom: '1rem' }} />

            <label style={labelStyle}>Agent ID</label>
            <input value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
              placeholder="From Anthropic console" style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, marginBottom: '1rem' }} />

            <label style={labelStyle}>Fetch frequency</label>
            <select value={form.schedule_cron} onChange={e => setForm(f => ({ ...f, schedule_cron: e.target.value }))}
              style={{ ...inputStyle, marginBottom: '1.25rem', appearance: 'auto' }}>
              {SCHEDULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <div style={{ background: '#e8f5e9', borderRadius: 6, padding: '0.6rem 0.75rem', fontSize: 12, color: '#2a6b2e', marginBottom: '1.25rem' }}>
              First fetch will start immediately after adding.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAdd(false); setError(''); }} className="btn-ghost" style={{ fontSize: 13 }}>Cancel</button>
              <button onClick={addSource} disabled={!form.name || !form.agent_id || adding} className="btn-primary" style={{ fontSize: 13 }}>
                {adding ? 'Adding…' : 'Add source'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
