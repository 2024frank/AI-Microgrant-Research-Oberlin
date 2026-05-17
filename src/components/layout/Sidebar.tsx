'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ClipboardList, Database, Users, BarChart2, LogOut } from 'lucide-react';

interface SidebarProps { role: 'admin' | 'reviewer'; name: string; }

export default function Sidebar({ role, name }: SidebarProps) {
  const path = usePathname();
  const isActive = (href: string) => path.startsWith(href);

  return (
    <aside style={{ width: 220, minHeight: '100vh', borderRight: '1px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '1.25rem 1rem 1rem', borderBottom: '1px solid #e8f5e9', display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="34" height="34" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="46" stroke="#3a8c3f" strokeWidth="5"/>
          <path d="M22 68 Q20 56 30 52 L42 47 Q48 45 50 52 L52 60" stroke="#3a8c3f" strokeWidth="4" fill="none" strokeLinecap="round"/>
          <path d="M78 68 Q80 56 70 52 L58 47 Q52 45 50 52" stroke="#3a8c3f" strokeWidth="4" fill="none" strokeLinecap="round"/>
          <rect x="40" y="28" width="8" height="24" rx="1" fill="#3a8c3f"/>
          <rect x="48" y="22" width="8" height="30" rx="1" fill="#3a8c3f"/>
          <rect x="56" y="32" width="8" height="20" rx="1" fill="#3a8c3f"/>
          <rect x="32" y="36" width="8" height="16" rx="1" fill="#3a8c3f" opacity="0.6"/>
          <rect x="64" y="38" width="8" height="14" rx="1" fill="#3a8c3f" opacity="0.6"/>
          <rect x="24" y="52" width="52" height="3" rx="1.5" fill="#3a8c3f" opacity="0.3"/>
        </svg>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#3a8c3f', letterSpacing: 1 }}>AI CALENDAR</div>
          <div style={{ fontSize: 10, color: '#999' }}>Oberlin Dashboard</div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '0.75rem 0.5rem' }}>
        {role === 'admin' && (
          <>
            <SideLink href="/admin/stats"    icon={<BarChart2 size={15}/>}     label="Dashboard"    active={isActive('/admin/stats')} />
            <SideLink href="/admin/sources"  icon={<Database size={15}/>}      label="Sources"      active={isActive('/admin/sources')} />
            <SideLink href="/admin/users"    icon={<Users size={15}/>}         label="Users"        active={isActive('/admin/users')} />
            <div style={{ borderTop: '1px solid #eee', margin: '0.5rem 0' }}/>
          </>
        )}
        {role === 'reviewer' && (
          <SideLink href="/reviewer/dashboard" icon={<LayoutDashboard size={15}/>} label="Dashboard" active={isActive('/reviewer/dashboard')} />
        )}
        <SideLink href="/reviewer/queue" icon={<ClipboardList size={15}/>} label="Review queue" active={isActive('/reviewer/queue')} />
      </nav>

      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#3a8c3f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
          {name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'capitalize' }}>{role}</div>
        </div>
        <button
          onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: 0 }}
          title="Sign out">
          <LogOut size={13}/>
        </button>
      </div>
    </aside>
  );
}

function SideLink({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0.45rem 0.75rem', borderRadius: 6, marginBottom: 2,
      fontSize: 13, textDecoration: 'none',
      background: active ? '#e8f5e9' : 'transparent',
      color: active ? '#2a6b2e' : '#444',
      fontWeight: active ? 600 : 400,
    }}>
      {icon} {label}
    </Link>
  );
}
