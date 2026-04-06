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
