export type Status = 'pipeline' | 'active' | 'stalled' | 'urgent' | 'closed';

export type Region =
  | 'romania' | 'turkey' | 'europe'
  | 'jordan' | 'ksa' | 'oman' | 'qatar' | 'dubai' | 'iraq' | 'yemen' | 'middle_east'
  | 'south_korea' | 'asia';

export interface Project {
  id: string;
  name: string;
  client: string;
  region: Region;
  status: Status;
  owner: string;
  value: string;
  deadline: string | null;
  progress: number;
  description: string;
  next_steps: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  project_id: string;
  user_name: string;
  text: string;
  created_at: string;
}

export interface TeamMember {
  name: string;
  color: string;
  role: string;
}

export interface Settings {
  id: number;
  dash_title: string;
  dash_subtitle: string;
  brand_name: string;
  users: TeamMember[];
}

export const REGION_LABELS: Record<string, string> = {
  asia: 'Asia Pacific', europe: 'Europe', middle_east: 'Middle East',
  romania: '🇷🇴 Romania', turkey: '🇹🇷 Turkey', jordan: '🇯🇴 Jordan',
  ksa: '🇸🇦 KSA', oman: '🇴🇲 Oman', qatar: '🇶🇦 Qatar',
  dubai: '🇦🇪 Dubai', iraq: '🇮🇶 Iraq', yemen: '🇾🇪 Yemen',
  south_korea: '🇰🇷 South Korea',
};

export const REGION_COLORS: Record<string, string> = {
  asia: '#3a7fe0', europe: '#7a5be0', middle_east: '#e0923a',
  romania: '#7a5be0', turkey: '#9b3de0', jordan: '#e0923a',
  ksa: '#C12033', oman: '#2a9d5c', qatar: '#8b1a1a',
  dubai: '#c46a00', iraq: '#8b6914', yemen: '#555', south_korea: '#3a7fe0',
};

export const STATUS_COLORS: Record<Status, string> = {
  active: '#2a9d5c', pipeline: '#3a7fe0', stalled: '#e0923a',
  urgent: '#C12033', closed: '#999',
};

export const EUROPE_REGIONS = ['europe', 'romania', 'turkey'];
export const ME_REGIONS = ['middle_east', 'jordan', 'ksa', 'oman', 'qatar', 'dubai', 'iraq', 'yemen'];
export const ASIA_REGIONS = ['asia', 'south_korea'];
