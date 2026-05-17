'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { TrendingUp, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function AdminStatsPage() {
  const [stats, setStats]       = useState<any>(null);
  const [sources, setSources]   = useState<any[]>([]);
  const [reasons, setReasons]   = useState<any[]>([]);
  const [fields, setFields]     = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [days, setDays]         = useState('30');
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';

  useEffect(() => {
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`/api/admin/stats?type=stats&days=${days}`, { headers: h }).then(r => r.json()),
      fetch(`/api/admin/stats?type=by-source&days=${days}`, { headers: h }).then(r => r.json()),
      fetch(`/api/admin/stats?type=rejection-reasons&days=${days}`, { headers: h }).then(r => r.json()),
      fetch(`/api/admin/stats?type=field-edits&days=${days}`, { headers: h }).then(r => r.json()),
      fetch(`/api/admin/stats?type=timeline&days=${days}`, { headers: h }).then(r => r.json()),
    ]).then(([s, src, r, f, t]) => { setStats(s); setSources(src); setReasons(r); setFields(f); setTimeline(t); });
  }, [days]);

  const maxEdits = Math.max(...fields.map(f => f.edits), 1);
  const maxApproved = Math.max(...sources.map(s => s.total || 0), 1);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f9fa' }}>
      <Sidebar role="admin" name="Admin" />

      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Dashboard</h1>
          <select value={days} onChange={e => setDays(e.target.value)}
            style={{ padding: '0.4rem 0.75rem', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 13, outline: 'none' }}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        {/* Stat cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <StatCard label="Extracted" value={stats.total_extracted || 0} icon={<TrendingUp size={18} color="#3a8c3f"/>} />
            <StatCard label="Approved" value={stats.total_approved || 0} icon={<CheckCircle size={18} color="#3a8c3f"/>} color="#e8f5e9" />
            <StatCard label="Rejected" value={stats.total_rejected || 0} icon={<XCircle size={18} color="#c0392b"/>} color="#fdecea" />
            <StatCard label="Approval rate" value={`${stats.approval_rate || 0}%`} icon={<Clock size={18} color="#3a8c3f"/>} color="#e8f5e9" />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
          {/* Approval rate by source */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Approval rate by source</h3>
            {sources.map(s => (
              <div key={s.id} style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ color: '#888' }}>{s.approved || 0}/{s.total || 0} ({s.approval_rate || 0}%)</span>
                </div>
                <div style={{ background: '#eee', borderRadius: 4, height: 6 }}>
                  <div style={{ background: '#3a8c3f', borderRadius: 4, height: 6, width: `${s.approval_rate || 0}%`, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Rejection reasons */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Rejection reasons</h3>
            {reasons.slice(0, 8).map((r: any) => (
              <div key={r.reason} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#c0392b', flexShrink: 0 }} />
                <span style={{ fontSize: 12, flex: 1 }}>{r.reason.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#c0392b' }}>{r.count}</span>
              </div>
            ))}
            {!reasons.length && <p style={{ fontSize: 12, color: '#aaa' }}>No rejections yet</p>}
          </div>
        </div>

        {/* Most-edited fields */}
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Most-edited fields by reviewers <span style={{ fontSize: 11, fontWeight: 400, color: '#888' }}>(extraction accuracy signal)</span></h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fields.slice(0, 8).map((f: any) => (
              <div key={f.field_name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, width: 160, color: '#444', fontFamily: 'monospace' }}>{f.field_name}</span>
                <div style={{ flex: 1, background: '#eee', borderRadius: 4, height: 8 }}>
                  <div style={{ background: '#e67e22', borderRadius: 4, height: 8, width: `${(f.edits / maxEdits) * 100}%`, transition: 'width 0.5s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e67e22', width: 30, textAlign: 'right' }}>{f.edits}</span>
              </div>
            ))}
            {!fields.length && <p style={{ fontSize: 12, color: '#aaa' }}>No edits recorded yet</p>}
          </div>
        </div>

        {/* Timeline */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Events over time</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
            {timeline.slice(-30).map((t: any, i: number) => {
              const maxVal = Math.max(...timeline.map((x: any) => x.extracted), 1);
              return (
                <div key={i} title={`${t.date}: ${t.extracted} extracted, ${t.approved} approved`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', cursor: 'default' }}>
                  <div style={{ width: '100%', background: '#3a8c3f', borderRadius: '2px 2px 0 0', height: `${(t.approved / maxVal) * 70}px`, minHeight: t.approved > 0 ? 2 : 0 }} />
                  <div style={{ width: '100%', background: '#c8e6c9', borderRadius: 0, height: `${((t.extracted - t.approved) / maxVal) * 70}px`, minHeight: (t.extracted - t.approved) > 0 ? 2 : 0 }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#888' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#3a8c3f', display: 'inline-block', borderRadius: 2 }}/> Approved</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#c8e6c9', display: 'inline-block', borderRadius: 2 }}/> Extracted</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon, color = '#f8f9fa' }: any) {
  return (
    <div className="card" style={{ background: color, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ padding: 8, background: 'white', borderRadius: 8 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      </div>
    </div>
  );
}
