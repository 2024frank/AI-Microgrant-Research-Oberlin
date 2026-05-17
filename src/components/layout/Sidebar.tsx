'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, Database, Users, BarChart2, LogOut } from 'lucide-react';

interface SidebarProps { role: 'admin' | 'reviewer'; name: string; }

export default function Sidebar({ role, name }: SidebarProps) {
  const path = usePathname();
  const isActive = (href: string) => path.startsWith(href);

  return (
    <aside style={{ width: 220, minHeight: '100vh', borderRight: '1px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '1.25rem 1rem 1rem', borderBottom: '1px solid #e8f5e9', display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="34" height="34" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="46" stroke="#3a8c3f" strokeWidth="5"/>
          <path d="M50 78 C38 78 30 70 26 60 L50 18 L74 60 C70 70 62 78 50 78Z" fill="#3a8c3f"/>
          <path d="M36 60 Q50 85 64 60" stroke="#3a8c3f" strokeWidth="3" fill="none" strokeLinecap="round"/>
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
        <SideLink href="/reviewer/queue" icon={<ClipboardList size={15}/>} label="Review queue" active={isActive('/reviewer')} />
      </nav>

      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#3a8c3f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
          {name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'capitalize' }}>{role}</div>
        </div>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: 0 }}><LogOut size={13}/></button>
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
