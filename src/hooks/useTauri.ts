import { invoke } from '@tauri-apps/api/core';
import type { Project, Scan, Finding } from '../types';
export { SEVERITY_COLORS } from '../types';

export async function listProjects(): Promise<Project[]> {
  return invoke('list_projects');
}

export async function addProjectLocal(path: string, name?: string): Promise<Project> {
  return invoke('add_project_local', { path, name });
}

export async function addProjectGithub(owner: string, repo: string, name?: string): Promise<Project> {
  return invoke('add_project_github', { owner, repo, name });
}

export async function deleteProject(projectId: string): Promise<void> {
  return invoke('delete_project', { projectId });
}

export async function startScan(projectId: string): Promise<Scan> {
  return invoke('start_scan', { projectId });
}

export async function getScanResults(scanId: string): Promise<Finding[]> {
  return invoke('get_scan_results', { scanId });
}

export async function listScans(projectId: string): Promise<Scan[]> {
  return invoke('list_scans', { projectId });
}

export async function autoFixDeps(projectId: string): Promise<string> {
  return invoke('auto_fix_deps', { projectId });
}

export async function exportHtmlReport(projectId: string, scanId: string, outputPath: string): Promise<void> {
  return invoke('export_html_report', { projectId, scanId, outputPath });
}

export async function compareScansToPrevious(scanId: string): Promise<{
  new_findings: Finding[];
  fixed_count: number;
  score_delta: number;
}> {
  return invoke('compare_scans', { scanId });
}

export async function readFileContext(filePath: string, lineNumber?: number): Promise<{
  content: string;
  language: string;
  total_lines: number;
  target_line?: number;
}> {
  return invoke('read_file_context', { filePath, lineNumber });
}

export async function getAiFix(findingId: string, dbPathStr: string): Promise<{
  available: boolean;
  model?: string;
  explanation: string;
  fix_suggestion: string;
  fixed_code?: string;
}> {
  return invoke('get_ai_fix', { findingId, dbPathStr });
}

export function scoreGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-400';
  if (score >= 75) return 'text-blue-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-500';
}
