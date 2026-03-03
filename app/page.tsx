import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Dashboard from '@/components/Dashboard';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: projects }, { data: comments }, { data: settingsRows }] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('comments').select('*').order('created_at', { ascending: true }),
    supabase.from('settings').select('*').eq('id', 1),
  ]);

  const defaultSettings = {
    id: 1,
    dash_title: 'All Regions',
    dash_subtitle: 'Checkmate Government Relations — Project Dashboard',
    brand_name: 'CHECKMATE',
    users: [
      { name: 'GC',    color: '#C12033', role: 'Chief of Staff' },
      { name: 'Yoshi', color: '#3D4F5F', role: 'Japan Practice Lead' },
      { name: 'Nico',  color: '#3a7fe0', role: 'Senior Advisor' },
      { name: 'Ches',  color: '#2a9d5c', role: 'Managing Partner' },
    ],
  };

  return (
    <Dashboard
      initialProjects={projects ?? []}
      initialComments={comments ?? []}
      initialSettings={settingsRows?.[0] ?? defaultSettings}
      userEmail={user.email ?? ''}
    />
  );
}
