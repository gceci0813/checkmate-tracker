'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Project, Comment, Settings, Status, Region, TeamMember } from '@/lib/types';
import { REGION_LABELS, REGION_COLORS, STATUS_COLORS, EUROPE_REGIONS, ME_REGIONS, ASIA_REGIONS } from '@/lib/types';

// ─── helpers ────────────────────────────────────────────────────────────────
function timeAgo(ts: string) {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}
function escHtml(t: string) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function regionGroup(r: string) {
  if (EUROPE_REGIONS.includes(r)) return 'europe';
  if (ME_REGIONS.includes(r)) return 'middle_east';
  if (ASIA_REGIONS.includes(r)) return 'asia';
  return r;
}

// ─── types ──────────────────────────────────────────────────────────────────
type SortKey = 'created_at' | 'oldest' | 'name' | 'deadline' | 'progress_desc' | 'progress_asc' | 'status';

interface DashboardProps {
  initialProjects: Project[];
  initialComments: Comment[];
  initialSettings: Settings;
  userEmail: string;
}

// ─── component ──────────────────────────────────────────────────────────────
export default function Dashboard({ initialProjects, initialComments, initialSettings, userEmail }: DashboardProps) {
  const supabase = createClient();
  const router = useRouter();

  // State
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [currentRegion, setCurrentRegion] = useState<string>('all');
  const [currentUser, setCurrentUser] = useState<string>(initialSettings.users[0]?.name ?? 'GC');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('created_at');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [quickStatusId, setQuickStatusId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type?: string } | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [lastSync, setLastSync] = useState(new Date());

  // Modals
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [settingsModal, setSettingsModal] = useState(false);

  // Form state
  const emptyForm = { name: '', client: '', region: 'romania' as Region, status: 'pipeline' as Status, owner: settings.users[0]?.name ?? 'GC', value: '', deadline: '', progress: 0, description: '', next_steps: '' };
  const [form, setForm] = useState(emptyForm);

  // Settings form
  const [sForm, setSForm] = useState({ dash_title: '', dash_subtitle: '', brand_name: '', users: [] as TeamMember[] });

  // Comment inputs
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── toast ──
  function showToast(msg: string, type?: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  // ── realtime subscriptions ──
  useEffect(() => {
    const ch = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        supabase.from('projects').select('*').order('created_at', { ascending: false })
          .then(({ data }) => { if (data) { setProjects(data); setLastSync(new Date()); } });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => {
        supabase.from('comments').select('*').order('created_at', { ascending: true })
          .then(({ data }) => { if (data) setComments(data); });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => {
        supabase.from('settings').select('*').eq('id', 1)
          .then(({ data }) => { if (data?.[0]) setSettings(data[0]); });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── keyboard shortcuts ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !modal && !settingsModal) openAddModal();
      if (e.key === 'Escape') { setModal(null); setSettingsModal(false); setDeleteConfirm(null); setQuickStatusId(null); setMobileSidebar(false); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal, settingsModal]);

  // ── filtered / sorted projects ──
  const filteredProjects = useCallback(() => {
    let list = [...projects];
    if (currentRegion !== 'all') {
      if (currentRegion === 'europe') list = list.filter(p => EUROPE_REGIONS.includes(p.region));
      else if (currentRegion === 'middle_east') list = list.filter(p => ME_REGIONS.includes(p.region));
      else if (currentRegion === 'asia') list = list.filter(p => ASIA_REGIONS.includes(p.region));
      else list = list.filter(p => p.region === currentRegion);
    }
    if (search) list = list.filter(p => `${p.name} ${p.client} ${p.owner} ${p.description}`.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter) list = list.filter(p => p.status === statusFilter);
    if (ownerFilter) list = list.filter(p => p.owner === ownerFilter);
    const statusOrder: Record<Status, number> = { urgent: 0, active: 1, pipeline: 2, stalled: 3, closed: 4 };
    list.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name': return a.name.localeCompare(b.name);
        case 'deadline': if (!a.deadline && !b.deadline) return 0; if (!a.deadline) return 1; if (!b.deadline) return -1; return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'progress_desc': return b.progress - a.progress;
        case 'progress_asc': return a.progress - b.progress;
        case 'status': return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return list;
  }, [projects, currentRegion, search, statusFilter, ownerFilter, sortBy]);

  // ── stats ──
  function stats(list: Project[]) {
    return {
      total: list.length,
      active: list.filter(p => p.status === 'active').length,
      urgent: list.filter(p => p.status === 'urgent').length,
      pipeline: list.filter(p => p.status === 'pipeline').length,
      stalled: list.filter(p => p.status === 'stalled').length,
    };
  }

  function regionCount(r: string) {
    if (r === 'all') return projects.length;
    if (r === 'europe') return projects.filter(p => EUROPE_REGIONS.includes(p.region)).length;
    if (r === 'middle_east') return projects.filter(p => ME_REGIONS.includes(p.region)).length;
    if (r === 'asia') return projects.filter(p => ASIA_REGIONS.includes(p.region)).length;
    return projects.filter(p => p.region === r).length;
  }

  const userMap: Record<string, string> = {};
  settings.users.forEach(u => { userMap[u.name] = u.color; });

  const displayed = filteredProjects();
  const s = stats(displayed);

  // ── project actions ──
  function openAddModal() {
    setEditId(null);
    setForm({ ...emptyForm, owner: currentUser, region: (currentRegion !== 'all' ? currentRegion as Region : 'romania') });
    setModal('add');
  }

  function openEditModal(p: Project) {
    setEditId(p.id);
    setForm({ name: p.name, client: p.client, region: p.region, status: p.status, owner: p.owner, value: p.value, deadline: p.deadline ?? '', progress: p.progress, description: p.description, next_steps: p.next_steps });
    setModal('edit');
  }

  async function saveProject() {
    if (!form.name.trim()) { showToast('Project name is required', 'error'); return; }
    if (editId) {
      const { error } = await supabase.from('projects').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editId);
      if (error) { showToast('Failed to save', 'error'); return; }
      showToast('Project updated ✓');
    } else {
      const { error } = await supabase.from('projects').insert([{ ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
      if (error) { showToast('Failed to save', 'error'); return; }
      showToast('Project added ✓', 'success');
    }
    setModal(null);
  }

  async function deleteProject(id: string) {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) { showToast('Delete failed', 'error'); return; }
    setDeleteConfirm(null);
    showToast('Project deleted');
  }

  async function quickStatusChange(id: string, status: Status) {
    await supabase.from('projects').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setQuickStatusId(null);
    showToast(`Status → ${status} ✓`);
  }

  // ── comments ──
  async function postComment(projectId: string) {
    const text = (commentInputs[projectId] ?? '').trim();
    if (!text) return;
    await supabase.from('comments').insert([{ project_id: projectId, user_name: currentUser, text, created_at: new Date().toISOString() }]);
    setCommentInputs(prev => ({ ...prev, [projectId]: '' }));
    showToast('Comment posted ✓');
  }

  // ── settings ──
  function openSettingsModal() {
    setSForm({ dash_title: settings.dash_title, dash_subtitle: settings.dash_subtitle, brand_name: settings.brand_name, users: JSON.parse(JSON.stringify(settings.users)) });
    setSettingsModal(true);
  }

  async function saveSettings() {
    const { error } = await supabase.from('settings').upsert({ id: 1, ...sForm });
    if (error) { showToast('Failed to save settings', 'error'); return; }
    setSettings(prev => ({ ...prev, ...sForm }));
    setSettingsModal(false);
    showToast('Settings saved ✓');
  }

  // ── export ──
  async function exportJSON() {
    const data = { projects, comments, settings, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `checkmate-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    showToast('JSON exported ✓');
  }

  async function exportCSV() {
    const headers = ['ID', 'Name', 'Client', 'Region', 'Status', 'Owner', 'Value', 'Deadline', 'Progress', 'Description', 'Next Steps', 'Created'];
    const rows = projects.map(p => [p.id, p.name, p.client, p.region, p.status, p.owner, p.value, p.deadline ?? '', p.progress, p.description, p.next_steps, p.created_at.slice(0, 10)].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`));
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `checkmate-projects-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    showToast('CSV exported ✓', 'success');
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // ─────────────────────────────────────────────────────────────────── render
  return (
    <div className="min-h-screen flex flex-col">
      {/* TOP BAR */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 h-14 shadow-md" style={{ background: '#C12033' }}>
        <div className="flex items-center gap-2">
          <button className="md:hidden text-white/90 text-xl px-2" onClick={() => setMobileSidebar(!mobileSidebar)}>☰</button>
          <div className="font-display font-black text-white text-[19px] tracking-wide flex items-center gap-2">
            ✦ <span>{settings.brand_name || 'CHECKMATE'}</span>
            <span className="font-sans font-normal text-[11px] text-white/70 tracking-[2px] uppercase">Project Tracker</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[13px] text-white/90">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: userMap[currentUser] || 'rgba(255,255,255,0.25)' }}>
              {currentUser.slice(0, 2).toUpperCase()}
            </div>
            <select value={currentUser} onChange={e => setCurrentUser(e.target.value)} className="bg-white/15 border border-white/30 text-white px-2.5 py-1 rounded text-[12px] outline-none cursor-pointer">
              {settings.users.map(u => <option key={u.name} value={u.name} className="text-gray-800">{u.name}{u.role ? ` — ${u.role}` : ''}</option>)}
            </select>
          </div>
          <button onClick={openSettingsModal} className="topbar-btn">⚙ Settings</button>
          <button onClick={exportJSON} className="topbar-btn hidden sm:inline-flex">⬇ JSON</button>
          <button onClick={exportCSV} className="topbar-btn hidden sm:inline-flex">⬇ CSV</button>
          <button onClick={signOut} className="bg-white/10 border border-white/25 text-white/85 px-3.5 py-1.5 rounded text-[13px] font-sans cursor-pointer hover:bg-white/20 transition-colors flex items-center gap-1.5">
            🔒 Sign Out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
        {/* SIDEBAR OVERLAY (mobile) */}
        {mobileSidebar && <div className="fixed inset-0 top-14 bg-black/40 z-30 md:hidden" onClick={() => setMobileSidebar(false)} />}

        {/* SIDEBAR */}
        <aside className={`sidebar-scroll flex flex-col flex-shrink-0 overflow-y-auto transition-all duration-250 z-40
          ${mobileSidebar ? 'fixed top-14 left-0 bottom-0 w-64' : 'hidden md:flex w-64'}
        `} style={{ background: '#3D4F5F' }}>
          {/* All */}
          <div className="px-5 pt-6 pb-3">
            <div className="text-[10px] uppercase tracking-[2px] text-white/40 font-semibold mb-3">All</div>
            <SidebarTab label="All Regions" count={regionCount('all')} color="#C12033" active={currentRegion === 'all'} onClick={() => { setCurrentRegion('all'); setMobileSidebar(false); }} />
          </div>
          <div className="px-5 pb-3">
            <div className="text-[10px] uppercase tracking-[2px] text-white/40 font-semibold mb-3">Europe</div>
            <SidebarTab label="All Europe" count={regionCount('europe')} color="#7a5be0" active={currentRegion === 'europe'} onClick={() => { setCurrentRegion('europe'); setMobileSidebar(false); }} />
            <SidebarTab label="🇷🇴 Romania" count={regionCount('romania')} indent active={currentRegion === 'romania'} onClick={() => { setCurrentRegion('romania'); setMobileSidebar(false); }} />
            <SidebarTab label="🇹🇷 Turkey" count={regionCount('turkey')} indent active={currentRegion === 'turkey'} onClick={() => { setCurrentRegion('turkey'); setMobileSidebar(false); }} />
          </div>
          <div className="px-5 pb-3">
            <div className="text-[10px] uppercase tracking-[2px] text-white/40 font-semibold mb-3">Middle East</div>
            <SidebarTab label="All Middle East" count={regionCount('middle_east')} color="#e0923a" active={currentRegion === 'middle_east'} onClick={() => { setCurrentRegion('middle_east'); setMobileSidebar(false); }} />
            {['jordan', 'ksa', 'oman', 'qatar', 'dubai', 'iraq', 'yemen'].map(r => (
              <SidebarTab key={r} label={REGION_LABELS[r]} count={regionCount(r)} indent active={currentRegion === r} onClick={() => { setCurrentRegion(r); setMobileSidebar(false); }} />
            ))}
          </div>
          <div className="px-5 pb-3">
            <div className="text-[10px] uppercase tracking-[2px] text-white/40 font-semibold mb-3">Asia Pacific</div>
            <SidebarTab label="All Asia Pacific" count={regionCount('asia')} color="#3a7fe0" active={currentRegion === 'asia'} onClick={() => { setCurrentRegion('asia'); setMobileSidebar(false); }} />
            <SidebarTab label="🇰🇷 South Korea" count={regionCount('south_korea')} indent active={currentRegion === 'south_korea'} onClick={() => { setCurrentRegion('south_korea'); setMobileSidebar(false); }} />
          </div>
          {/* Status legend */}
          <div className="px-5 py-4 border-t border-white/10 mt-auto">
            <div className="text-[10px] uppercase tracking-[2px] text-white/40 font-semibold mb-3">Status Key</div>
            {Object.entries(STATUS_COLORS).map(([s, c]) => (
              <div key={s} className="flex items-center gap-2 text-[12px] text-white/60 mb-2">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: c }} />
                <span className="capitalize">{s}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 border-t border-white/10 text-[11px] text-white/30">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />Live — updates sync in real-time</div>
            <div className="mt-1">Last sync: {lastSync.toLocaleTimeString()}</div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {/* Header row */}
          <div className="flex items-start justify-between mb-7">
            <div>
              <h1 className="font-display text-[30px] font-bold leading-tight" style={{ color: '#3D4F5F' }}>
                {currentRegion === 'all' ? (settings.dash_title || 'All Regions') : (REGION_LABELS[currentRegion] || currentRegion)}
              </h1>
              <p className="text-[13px] text-gray-500 mt-1">{settings.dash_subtitle}</p>
            </div>
            <button onClick={openAddModal} className="flex items-center gap-2 text-white px-5 py-2.5 rounded-md text-[14px] font-semibold whitespace-nowrap transition-colors hover:opacity-90" style={{ background: '#C12033' }}>
              + Add Project <span className="hidden sm:inline text-white/60 text-[11px] font-normal">(N)</span>
            </button>
          </div>

          {/* Stats */}
          <div className="grid gap-4 mb-7" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {[
              { label: 'Total', value: s.total, icon: '📂', color: '#C12033' },
              { label: 'Active', value: s.active, icon: '⚡', color: '#2a9d5c' },
              { label: 'Urgent', value: s.urgent, icon: '🚨', color: '#C12033' },
              { label: 'Pipeline', value: s.pipeline, icon: '🎯', color: '#3a7fe0' },
              { label: 'Stalled', value: s.stalled, icon: '⏸', color: '#e0923a' },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-lg p-5 shadow-sm border-l-4" style={{ borderLeftColor: stat.color }}>
                <div className="flex items-start justify-between mb-0.5">
                  <div className="font-display text-[34px] font-bold leading-none" style={{ color: '#3D4F5F' }}>{stat.value}</div>
                  <div className="text-[20px] opacity-50 mt-1">{stat.icon}</div>
                </div>
                <div className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mt-1.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Search + filters */}
          <div className="flex flex-wrap gap-2 mb-5">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[14px]">🔍</span>
              <input type="text" placeholder="Search projects, clients, owners…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-md text-[14px] outline-none focus:border-[#C12033] bg-white" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-200 rounded-md px-3 py-2.5 text-[13px] outline-none bg-white text-gray-700 cursor-pointer focus:border-[#C12033]">
              <option value="">All Statuses</option>
              {(['active', 'pipeline', 'stalled', 'urgent', 'closed'] as Status[]).map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
            <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="border border-gray-200 rounded-md px-3 py-2.5 text-[13px] outline-none bg-white text-gray-700 cursor-pointer focus:border-[#C12033]">
              <option value="">All Owners</option>
              {settings.users.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)} className="border border-gray-200 rounded-md px-3 py-2.5 text-[13px] outline-none bg-white text-gray-700 cursor-pointer focus:border-[#C12033]">
              <option value="created_at">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name A–Z</option>
              <option value="deadline">By Deadline</option>
              <option value="progress_desc">Progress ↓</option>
              <option value="progress_asc">Progress ↑</option>
              <option value="status">By Status</option>
            </select>
          </div>

          {/* Projects */}
          {displayed.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-[20px] font-semibold text-slate mb-2">No projects found</div>
              <p className="text-[14px]">Adjust filters or <button onClick={openAddModal} className="text-[#C12033] underline">add a new project</button>.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {displayed.map(p => {
                const pComments = comments.filter(c => c.project_id === p.id);
                const prog = p.progress || 0;
                const progColor = prog >= 70 ? '#2a9d5c' : prog >= 40 ? '#e0923a' : '#C12033';
                const daysUntil = p.deadline ? Math.ceil((new Date(p.deadline).getTime() - Date.now()) / 86400000) : null;
                const dateStr = !p.deadline ? '—' : daysUntil! <= 0 ? '🔴 Overdue' : daysUntil! <= 7 ? `⚠ In ${daysUntil}d` : new Date(p.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const expanded = expandedCards.has(p.id);

                return (
                  <div key={p.id} className={`bg-white rounded-xl border-l-[5px] shadow-sm hover:shadow-md transition-shadow border-status-${p.status} animate-fade-in`}>
                    {/* Card header */}
                    <div className="flex items-start gap-4 px-6 py-5 cursor-pointer" onClick={() => setExpandedCards(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-[16px] font-semibold text-gray-800">{p.name}</span>
                          {/* Quick status badge */}
                          <div className="relative" onClick={e => e.stopPropagation()}>
                            <span className={`status-badge badge-${p.status} text-[11px] font-bold px-2.5 py-[3px] rounded-full uppercase tracking-wide cursor-pointer hover:opacity-80 transition-opacity select-none`}
                              onClick={() => setQuickStatusId(quickStatusId === p.id ? null : p.id)}>
                              {p.status}
                            </span>
                            {quickStatusId === p.id && (
                              <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-20 min-w-[130px] overflow-hidden animate-modal">
                                {(['pipeline', 'active', 'stalled', 'urgent', 'closed'] as Status[]).map(s => (
                                  <div key={s} className={`flex items-center gap-2.5 px-3.5 py-2 text-[12px] font-semibold cursor-pointer hover:bg-gray-50 transition-colors ${s === p.status ? 'bg-gray-100' : ''}`}
                                    onClick={() => quickStatusChange(p.id, s)}>
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s] }} />
                                    <span className="capitalize">{s}{s === p.status ? ' ✓' : ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: REGION_COLORS[p.region] || '#666', background: `${REGION_COLORS[p.region] || '#666'}18` }}>
                            {REGION_LABELS[p.region] || p.region}
                          </span>
                        </div>
                        <div className="text-[12px] text-gray-400 mt-0.5">{p.client || '—'}</div>
                        <div className="flex items-center gap-5 mt-2.5 flex-wrap">
                          <span className="text-[12px] text-gray-500 flex items-center gap-1">👤 <strong className="font-semibold" style={{ color: userMap[p.owner] || '#666' }}>{p.owner || '—'}</strong></span>
                          <span className="text-[12px] text-gray-500 flex items-center gap-1">💰 <strong className="font-semibold text-gray-700">{p.value || 'TBD'}</strong></span>
                          <span className={`text-[12px] flex items-center gap-1 ${daysUntil !== null && daysUntil <= 0 ? 'text-red-DEFAULT font-semibold' : daysUntil !== null && daysUntil <= 7 ? 'text-warning font-semibold' : 'text-gray-500'}`}>📅 {dateStr}</span>
                          <span className="text-[12px] text-gray-500 flex items-center gap-1">💬 <strong className="font-semibold text-gray-700">{pComments.length}</strong></span>
                        </div>
                        {prog > 0 && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] text-gray-400">Progress</span>
                              <span className="text-[11px] font-semibold text-gray-700">{prog}%</span>
                            </div>
                            <div className="h-[6px] bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${prog}%`, background: progColor }} />
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEditModal(p)} className="border border-gray-200 px-3 py-1.5 rounded-md text-[12px] text-gray-500 hover:border-slate hover:text-slate transition-colors">Edit</button>
                        <button onClick={() => setDeleteConfirm(deleteConfirm === p.id ? null : p.id)} className="border border-[#C12033] px-3 py-1.5 rounded-md text-[12px] text-[#C12033] hover:bg-[#C12033] hover:text-white transition-colors">Delete</button>
                      </div>
                    </div>

                    {/* Delete confirm */}
                    {deleteConfirm === p.id && (
                      <div className="flex items-center gap-3 px-6 py-3 bg-red-50 border-t border-red-100 text-[12px] text-[#C12033] font-semibold animate-fade-in">
                        Delete this project?
                        <button onClick={() => deleteProject(p.id)} className="bg-[#C12033] text-white px-3 py-1 rounded text-[12px] font-semibold hover:bg-[#9a1829] transition-colors">Yes, Delete</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
                      </div>
                    )}

                    {/* Expand panel */}
                    {expanded && (
                      <div className="border-t border-gray-100 px-6 py-5 animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                          <div>
                            <h4 className="text-[11px] uppercase tracking-[1.5px] text-gray-400 font-semibold mb-2">Description</h4>
                            <p className="text-[14px] text-gray-700 leading-relaxed">{p.description || 'No description provided.'}</p>
                          </div>
                          <div>
                            <h4 className="text-[11px] uppercase tracking-[1.5px] text-gray-400 font-semibold mb-2">Next Steps</h4>
                            <p className="text-[14px] text-gray-700 leading-relaxed">{p.next_steps || 'No next steps defined.'}</p>
                          </div>
                        </div>
                        {/* Comments */}
                        <div>
                          <h4 className="text-[11px] uppercase tracking-[1.5px] text-gray-400 font-semibold mb-3">Comments & Updates ({pComments.length})</h4>
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                            {pComments.length === 0 ? (
                              <p className="text-[13px] text-gray-400 text-center py-3">No comments yet.</p>
                            ) : (
                              <div className="space-y-3 mb-3">
                                {pComments.map(c => (
                                  <div key={c.id} className="flex gap-2.5 animate-fade-in">
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: userMap[c.user_name] || '#666' }}>
                                      {c.user_name.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="text-[11px] text-gray-400 mb-0.5"><strong className="text-gray-700 font-semibold">{c.user_name}</strong> · {timeAgo(c.created_at)}</div>
                                      <div className="text-[13px] text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: escHtml(c.text) }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2 mt-2">
                              <textarea rows={2} placeholder="Add update or comment…" value={commentInputs[p.id] ?? ''} onChange={e => setCommentInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(p.id); } }}
                                className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-[13px] resize-none outline-none focus:border-[#C12033] bg-white" />
                              <button onClick={() => postComment(p.id)} className="bg-[#C12033] hover:bg-[#9a1829] text-white px-4 rounded-md text-[13px] font-semibold self-end transition-colors">Post</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl w-[560px] max-w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 rounded-t-xl" style={{ background: '#C12033' }}>
              <h3 className="font-display text-[20px] font-bold text-white">{modal === 'add' ? 'Add New Project' : 'Edit Project'}</h3>
              <button onClick={() => setModal(null)} className="text-white/80 text-2xl leading-none hover:text-white">×</button>
            </div>
            <div className="p-6 space-y-4">
              <FormRow label="Project Name *"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Romania SMR Investment" className="form-input" /></FormRow>
              <FormRow label="Client"><input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="e.g. Government of Romania" className="form-input" /></FormRow>
              <div className="grid grid-cols-2 gap-4">
                <FormRow label="Region *">
                  <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value as Region }))} className="form-input">
                    <option value="romania">🇷🇴 Romania</option><option value="turkey">🇹🇷 Turkey</option><option value="europe">Europe (Other)</option>
                    <option value="jordan">🇯🇴 Jordan</option><option value="ksa">🇸🇦 KSA</option><option value="oman">🇴🇲 Oman</option>
                    <option value="qatar">🇶🇦 Qatar</option><option value="dubai">🇦🇪 Dubai / UAE</option><option value="iraq">🇮🇶 Iraq</option>
                    <option value="yemen">🇾🇪 Yemen</option><option value="middle_east">Middle East (Other)</option>
                    <option value="south_korea">🇰🇷 South Korea</option><option value="asia">Asia Pacific (Other)</option>
                  </select>
                </FormRow>
                <FormRow label="Status">
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))} className="form-input">
                    <option value="pipeline">Pipeline</option><option value="active">Active</option><option value="stalled">Stalled</option><option value="urgent">Urgent</option><option value="closed">Closed</option>
                  </select>
                </FormRow>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormRow label="Owner">
                  <select value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} className="form-input">
                    {settings.users.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                  </select>
                </FormRow>
                <FormRow label="Deal Value"><input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="e.g. $2.5M or TBD" className="form-input" /></FormRow>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormRow label="Next Action Date"><input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} className="form-input" /></FormRow>
                <FormRow label="Progress %"><input type="number" min={0} max={100} value={form.progress} onChange={e => setForm(f => ({ ...f, progress: parseInt(e.target.value) || 0 }))} placeholder="0–100" className="form-input" /></FormRow>
              </div>
              <FormRow label="Description / Notes"><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Key details, strategy, current stage…" rows={3} className="form-input resize-y" /></FormRow>
              <FormRow label="Next Steps"><textarea value={form.next_steps} onChange={e => setForm(f => ({ ...f, next_steps: e.target.value }))} placeholder="Immediate action items…" rows={2} className="form-input resize-y" /></FormRow>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setModal(null)} className="border border-gray-200 px-5 py-2.5 rounded-md text-[14px] text-gray-500 hover:border-gray-400 transition-colors">Cancel</button>
              <button onClick={saveProject} className="bg-[#C12033] hover:bg-[#9a1829] text-white px-6 py-2.5 rounded-md text-[14px] font-semibold transition-colors">Save Project</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS MODAL ── */}
      {settingsModal && (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4" onClick={() => setSettingsModal(false)}>
          <div className="bg-white rounded-xl w-[620px] max-w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 rounded-t-xl" style={{ background: '#C12033' }}>
              <h3 className="font-display text-[20px] font-bold text-white">⚙ Dashboard Settings</h3>
              <button onClick={() => setSettingsModal(false)} className="text-white/80 text-2xl leading-none hover:text-white">×</button>
            </div>
            <div className="p-6">
              <SectionHeader>Dashboard Identity</SectionHeader>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <FormRow label="Dashboard Title"><input value={sForm.dash_title} onChange={e => setSForm(f => ({ ...f, dash_title: e.target.value }))} className="form-input" /></FormRow>
                <FormRow label="Subtitle / Org Name"><input value={sForm.dash_subtitle} onChange={e => setSForm(f => ({ ...f, dash_subtitle: e.target.value }))} className="form-input" /></FormRow>
              </div>
              <FormRow label="Logo / Brand Name"><input value={sForm.brand_name} onChange={e => setSForm(f => ({ ...f, brand_name: e.target.value }))} className="form-input mb-6" /></FormRow>

              <div className="flex items-center justify-between mb-3">
                <SectionHeader>Team Members</SectionHeader>
                <button onClick={() => setSForm(f => ({ ...f, users: [...f.users, { name: '', color: '#888888', role: '' }] }))}
                  className="bg-[#C12033] text-white text-[12px] font-semibold px-3 py-1.5 rounded hover:bg-[#9a1829] transition-colors">+ Add Member</button>
              </div>
              <div className="space-y-2.5">
                {sForm.users.map((u, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <input type="color" value={u.color} onChange={e => setSForm(f => ({ ...f, users: f.users.map((x, j) => j === i ? { ...x, color: e.target.value } : x) }))} className="w-8 h-8 rounded-full border-2 border-gray-200 cursor-pointer p-0.5" />
                    <input value={u.name} onChange={e => setSForm(f => ({ ...f, users: f.users.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} placeholder="Name" className="flex-1 form-input text-[13px]" />
                    <input value={u.role} onChange={e => setSForm(f => ({ ...f, users: f.users.map((x, j) => j === i ? { ...x, role: e.target.value } : x) }))} placeholder="Role (optional)" className="flex-1 form-input text-[13px]" />
                    <button onClick={() => setSForm(f => ({ ...f, users: f.users.filter((_, j) => j !== i) }))} className="text-gray-300 hover:text-[#C12033] text-xl leading-none transition-colors px-1">×</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setSettingsModal(false)} className="border border-gray-200 px-5 py-2.5 rounded-md text-[14px] text-gray-500 hover:border-gray-400 transition-colors">Cancel</button>
              <button onClick={saveSettings} className="bg-[#C12033] hover:bg-[#9a1829] text-white px-6 py-2.5 rounded-md text-[14px] font-semibold transition-colors">Save Settings</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[300] px-5 py-3 rounded-xl text-white text-[14px] font-medium shadow-lg animate-slide-up
          ${toast.type === 'success' ? 'bg-[#2a9d5c]' : toast.type === 'error' ? 'bg-[#C12033]' : 'bg-[#3D4F5F]'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── small helper components ──────────────────────────────────────────────────
function SidebarTab({ label, count, color, active, onClick, indent }: {
  label: string; count: number; color?: string; active: boolean; onClick: () => void; indent?: boolean;
}) {
  return (
    <div onClick={onClick} className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-md cursor-pointer text-[13px] font-medium mb-1 transition-colors
      ${active ? 'text-white' : 'text-white/65 hover:text-white hover:bg-white/8'}
      ${indent ? 'pl-7 text-[13px]' : ''}
    `} style={active ? { background: '#C12033' } : {}}>
      {color && !indent && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />}
      <span className="flex-1 truncate">{label}</span>
      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ml-auto ${active ? 'bg-white/25' : 'bg-white/12'}`}>{count}</span>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-bold uppercase tracking-wide mb-3 pb-1.5 border-b-2 border-[#C12033]" style={{ color: '#3D4F5F' }}>{children}</div>;
}
