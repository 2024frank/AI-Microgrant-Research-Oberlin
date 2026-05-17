'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ClipboardList, Database, Users, BarChart2, LogOut, Shield, Eye } from 'lucide-react';

interface SidebarProps {
  role: 'admin' | 'reviewer';
  name: string;
  email?: string;
}

export default function Sidebar({ role, name, email }: SidebarProps) {
  const path = usePathname();
  const isActive = (href: string) => path.startsWith(href);

  function signOut() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  return (
    <aside style={{ width: 224, minHeight: '100vh', borderRight: '1px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Logo + branding */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #e8f5e9', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image src="/logo.png" alt="AI Events Aggregator" width={38} height={38} style={{ borderRadius: 4, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#3a8c3f', letterSpacing: 0.5, lineHeight: 1.3 }}>AI EVENTS</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#3a8c3f', letterSpacing: 0.5, lineHeight: 1.3 }}>AGGREGATOR</div>
          <div style={{ fontSize: 9, color: '#aaa', marginTop: 1 }}>Oberlin Dashboard</div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '0.75rem 0.5rem' }}>
        {role === 'admin' && (
          <>
            <SideLink href="/admin/stats"    icon={<BarChart2 size={15}/>}      label="Dashboard"    active={isActive('/admin/stats')} />
            <SideLink href="/admin/sources"  icon={<Database size={15}/>}       label="Sources"      active={isActive('/admin/sources')} />
            <SideLink href="/admin/users"    icon={<Users size={15}/>}          label="Users"        active={isActive('/admin/users')} />
            <div style={{ borderTop: '1px solid #eee', margin: '0.5rem 0' }}/>
          </>
        )}
        <SideLink href="/reviewer/dashboard" icon={<LayoutDashboard size={15}/>} label="My dashboard" active={isActive('/reviewer/dashboard')} />
        <SideLink href="/reviewer/queue"     icon={<ClipboardList size={15}/>}   label="Review queue" active={isActive('/reviewer/queue')} />
      </nav>

      {/* User info at bottom */}
      <div style={{ padding: '0.875rem 1rem', borderTop: '1px solid #eee' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: role === 'admin' ? '#3a8c3f' : '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: role === 'admin' ? 'white' : '#3a8c3f', flexShrink: 0 }}>
            {name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            {email && <div style={{ fontSize: 10, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: role === 'admin' ? '#e8f5e9' : '#f0f0f0', color: role === 'admin' ? '#2a6b2e' : '#666' }}>
            {role === 'admin' ? <Shield size={9}/> : <Eye size={9}/>}
            {role}
          </span>
          <button onClick={signOut} title="Sign out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <LogOut size={12}/> Sign out
          </button>
        </div>
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
