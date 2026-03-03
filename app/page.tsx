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
      { name: 'Giancarlo', color: '#C12033', role: 'Chief of Staff' },
      { name: 'Usman',     color: '#3D4F5F', role: 'Senior Advisor' },
      { name: 'Nicholas',  color: '#3a7fe0', role: 'Senior Advisor' },
      { name: 'Cindy',     color: '#2a9d5c', role: 'Advisor' },
      { name: 'Ara',       color: '#7a5be0', role: 'Advisor' },
      { name: 'Theo',      color: '#e0923a', role: 'Advisor' },
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
