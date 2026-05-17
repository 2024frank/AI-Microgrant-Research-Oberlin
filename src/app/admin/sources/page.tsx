'use client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState, useRef } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { Plus, Play, ToggleLeft, ToggleRight, CheckCircle, XCircle, Loader, ExternalLink } from 'lucide-react';

const SCHEDULE_OPTIONS = [
  { label: 'Every hour',    value: '0 * * * *'   },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily (6am)',   value: '0 6 * * *'   },
  { label: 'Daily (noon)',  value: '0 12 * * *'  },
  { label: 'Weekly',        value: '0 6 * * 1'   },
];

interface RunStatus {
  id: number; source_id: number; source_name: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string; finished_at: string | null;
  events_extracted: number; events_skipped_dup: number;
  events_errored: number; elapsed_sec: number;
  error_log: any;
}

export default function SourcesPage() {
  const { user, token, ready } = useAuth('admin');
  const [sources, setSources]         = useState<any[]>([]);
  const [runs, setRuns]               = useState<RunStatus[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showAdd, setShowAdd]         = useState(false);
  const [form, setForm]               = useState({ name: '', agent_id: '', schedule_cron: '0 6 * * *' });
  const [adding, setAdding]           = useState(false);
  const [error, setError]             = useState('');
  const [triggering, setTriggering]   = useState<number | null>(null);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const pollRef                       = useRef<NodeJS.Timeout | null>(null);
  

  function load() {
    fetch('/api/sources', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setSources).finally(() => setLoading(false));
  }

  function loadRuns() {
    fetch('/api/agent/runs?limit=20', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        setRuns(d.runs || []);
        // Keep polling if any run is active
        if (d.has_active) {
          pollRef.current = setTimeout(loadRuns, 2000);
        } else {
          if (activeRunId) { load(); setActiveRunId(null); }
        }
      });
  }

  useEffect(() => { if (!ready || !token) return;
    load();
    loadRuns();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  async function addSource() {
    setAdding(true); setError('');
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Failed'); setAdding(false); return; }
    setShowAdd(false);
    setForm({ name: '', agent_id: '', schedule_cron: '0 6 * * *' });
    load();
    setAdding(false);
    // Start polling for the auto-triggered first run
    setActiveRunId(data.id);
    setTimeout(loadRuns, 1000);
  }

  async function triggerRun(sourceId: number) {
    setTriggering(sourceId);
    const res = await fetch(`/api/agent/trigger/${sourceId}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    setTriggering(null);
    if (res.ok) {
      setActiveRunId(sourceId);
      setTimeout(loadRuns, 500); // start polling immediately
    }
  }

  async function toggleActive(source: any) {
    await fetch(`/api/sources/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ active: source.active ? 0 : 1 }),
    });
    load();
  }

  // Get latest run per source
  const latestRunBySource: Record<number, RunStatus> = {};
  for (const r of runs) {
    if (!latestRunBySource[r.source_id]) latestRunBySource[r.source_id] = r;
  }

  // Active runs (running right now)
  const activeRuns = runs.filter(r => r.status === 'running');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f9fa' }}>
      <Sidebar role="admin" name={user?.name || 'Admin'} email={user?.email} />

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

        {/* Live run status banner */}
        {activeRuns.length > 0 && (
          <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 8, padding: '0.875rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Loader size={16} color="#3a8c3f" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}/>
            <div style={{ flex: 1 }}>
              {activeRuns.map(r => (
                <div key={r.id} style={{ fontSize: 13 }}>
                  <strong>{r.source_name}</strong> is fetching…
                  <span style={{ color: '#2a6b2e', marginLeft: 8 }}>
                    {r.events_extracted} extracted · {r.events_skipped_dup} dupes skipped · {r.elapsed_sec}s elapsed
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>Live · updating every 2s</div>
          </div>
        )}

        {loading ? <div style={{ color: '#888', fontSize: 14 }}>Loading…</div> : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #eee' }}>
                  {['Source', 'Agent ID', 'Schedule', 'Last run', 'Result', 'Approval', 'Active', ''].map(h => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map(s => {
                  const run = latestRunBySource[s.id];
                  const isRunning = run?.status === 'running';
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>{s.name}</td>
                      <td style={{ padding: '0.875rem 1rem', fontFamily: 'monospace', fontSize: 11, color: '#666' }}>
                        {s.agent_id?.slice(0, 18)}…
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: '#666' }}>
                        {SCHEDULE_OPTIONS.find(o => o.value === s.schedule_cron)?.label || s.schedule_cron}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontSize: 12 }}>
                        {isRunning ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#3a8c3f', fontWeight: 600 }}>
                            <Loader size={12} style={{ animation: 'spin 1s linear infinite' }}/> Running…
                          </span>
                        ) : run ? (
                          <span style={{ color: '#888' }}>{new Date(run.started_at).toLocaleDateString()}</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontSize: 12 }}>
                        {isRunning ? (
                          <span style={{ color: '#3a8c3f' }}>{run.events_extracted} so far</span>
                        ) : run?.status === 'completed' ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle size={12} color="#3a8c3f"/>
                            <span style={{ color: '#3a8c3f' }}>{run.events_extracted} new</span>
                            {run.events_skipped_dup > 0 && <span style={{ color: '#aaa' }}>· {run.events_skipped_dup} dupes</span>}
                          </span>
                        ) : run?.status === 'failed' ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c0392b' }}>
                            <XCircle size={12}/> Failed
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        {s.total_events > 0 ? (
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
                        <button onClick={() => triggerRun(s.id)}
                          disabled={!!triggering || isRunning || !s.active}
                          style={{ background: 'none', border: `1.5px solid ${isRunning ? '#c8e6c9' : '#3a8c3f'}`, borderRadius: 6, padding: '0.3rem 0.6rem', cursor: isRunning ? 'default' : 'pointer', color: isRunning ? '#aaa' : '#3a8c3f', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isRunning ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }}/> :
                           triggering === s.id ? <Loader size={11}/> : <Play size={11}/>}
                          {isRunning ? 'Running' : 'Run now'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {sources.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>No sources yet — add your first one</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Recent run history */}
        {runs.filter(r => r.status !== 'running').length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '0.75rem', color: '#555' }}>Recent runs</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {runs.filter(r => r.status !== 'running').slice(0, 5).map(r => (
                <div key={r.id} style={{ background: 'white', border: '1px solid #eee', borderRadius: 8, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                  {r.status === 'completed'
                    ? <CheckCircle size={14} color="#3a8c3f"/>
                    : <XCircle size={14} color="#c0392b"/>}
                  <span style={{ fontWeight: 600, width: 160 }}>{r.source_name}</span>
                  <span style={{ color: '#888' }}>{new Date(r.started_at).toLocaleString()}</span>
                  <span style={{ color: '#3a8c3f', marginLeft: 'auto' }}>{r.events_extracted} extracted</span>
                  <span style={{ color: '#aaa' }}>{r.events_skipped_dup} dupes</span>
                  <span style={{ color: '#aaa' }}>{r.elapsed_sec}s</span>
                  {r.status === 'failed' && r.error_log && (
                    <span style={{ color: '#c0392b', fontSize: 11 }}>{JSON.parse(r.error_log as any)?.[0]}</span>
                  )}
                </div>
              ))}
            </div>
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
              ✓ First fetch starts immediately. You'll see live progress above.
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
