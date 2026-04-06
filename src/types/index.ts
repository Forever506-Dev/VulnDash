export interface Project {
  id: string;
  name: string;
  path?: string;
  github_url?: string;
  github_owner?: string;
  github_repo?: string;
  created_at: number;
  last_scan_at?: number;
  score?: number;
}

export interface Scan {
  id: string;
  project_id: string;
  started_at: number;
  finished_at?: number;
  status: 'running' | 'completed' | 'failed';
  score?: number;
  summary?: ScanSummary;
}

export interface ScanSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface Finding {
  id: string;
  scan_id: string;
  tool: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description?: string;
  file_path?: string;
  line_number?: number;
  cve_id?: string;
  cvss_score?: number;
  fix_version?: string;
  ai_advice?: string;
  mitre_id?: string;
  status: 'open' | 'fixed' | 'ignored' | 'false_positive';
}

export const SEVERITY_COLORS = {
  critical: 'text-red-500 bg-red-500/10 border-red-500/20',
  high:     'text-orange-400 bg-orange-400/10 border-orange-400/20',
  medium:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  low:      'text-blue-400 bg-blue-400/10 border-blue-400/20',
  info:     'text-zinc-400 bg-zinc-400/10 border-zinc-400/20',
} as const;

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;
