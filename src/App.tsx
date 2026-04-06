import React, { useState, useEffect } from 'react';
import { Shield, FolderOpen, RefreshCw, Trash2, ChevronRight, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import type { Project, Scan, Finding } from './types';
import { listProjects, addProjectLocal, deleteProject, startScan, getScanResults, listScans, scoreGrade, scoreColor, SEVERITY_COLORS } from './hooks/useTauri';
import { open } from '@tauri-apps/plugin-dialog';
import './index.css';

// ── Score Gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const color = scoreColor(score);
  const grade = scoreGrade(score);
  const circumference = 2 * Math.PI * 54;
  const dash = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke={score >= 90 ? '#22c55e' : score >= 75 ? '#3b82f6' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{score}</span>
          <span className={`text-lg font-semibold ${color}`}>{grade}</span>
        </div>
      </div>
      <span className="text-zinc-400 text-sm">Security Score</span>
    </div>
  );
}

// ── Severity Badge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: Finding['severity'] }) {
  const colors = SEVERITY_COLORS[severity];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${colors}`}>
      {severity.toUpperCase()}
    </span>
  );
}

// ── Finding Card ──────────────────────────────────────────────────────────────

function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-zinc-900/60 border border-white/[0.06] rounded-xl p-4 cursor-pointer hover:border-white/10 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <SeverityBadge severity={finding.severity} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-100 truncate">{finding.title}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {finding.tool}
            {finding.cve_id && <span className="ml-2 text-zinc-400">{finding.cve_id}</span>}
            {finding.cvss_score && <span className="ml-2">CVSS: {finding.cvss_score.toFixed(1)}</span>}
          </p>
        </div>
        <ChevronRight className={`w-4 h-4 text-zinc-600 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`} />
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
          {finding.description && (
            <p className="text-xs text-zinc-400">{finding.description}</p>
          )}
          {finding.file_path && (
            <p className="text-xs font-mono text-zinc-500">
              📄 {finding.file_path}{finding.line_number ? `:${finding.line_number}` : ''}
            </p>
          )}
          {finding.fix_version && (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle className="w-3 h-3" />
              Fix: {finding.fix_version}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onScan,
  onDelete,
  onSelect,
  selected,
  scanning,
}: {
  project: Project;
  onScan: () => void;
  onDelete: () => void;
  onSelect: () => void;
  selected: boolean;
  scanning: boolean;
}) {
  const score = project.score;
  const color = score != null ? scoreColor(score) : 'text-zinc-500';

  return (
    <div
      className={`bg-zinc-900/60 border rounded-xl p-4 cursor-pointer transition-all ${
        selected ? 'border-red-500/40 bg-zinc-900/80' : 'border-white/[0.06] hover:border-white/10'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-100 truncate">{project.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5 truncate font-mono">
            {project.path || project.github_url || 'No path'}
          </p>
        </div>
        {score != null && (
          <span className={`text-2xl font-bold ${color}`}>{score}</span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={(e) => { e.stopPropagation(); onScan(); }}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-white/[0.06] text-xs font-medium hover:bg-zinc-700 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [scanning, setScanningId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const p = await listProjects();
      setProjects(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddProject() {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected || typeof selected !== 'string') return;
      const project = await addProjectLocal(selected);
      setProjects(prev => [project, ...prev]);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleScan(project: Project) {
    setScanningId(project.id);
    try {
      const scan = await startScan(project.id);
      const results = await getScanResults(scan.id);
      setProjects(prev => prev.map(p =>
        p.id === project.id ? { ...p, score: scan.score, last_scan_at: scan.finished_at } : p
      ));
      if (selectedProject?.id === project.id) {
        setFindings(results);
        setScans(prev => [scan, ...prev]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setScanningId(null);
    }
  }

  async function handleSelectProject(project: Project) {
    setSelectedProject(project);
    setFindings([]);
    try {
      const projectScans = await listScans(project.id);
      setScans(projectScans);
      if (projectScans.length > 0) {
        const results = await getScanResults(projectScans[0].id);
        setFindings(results);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDelete(project: Project) {
    await deleteProject(project.id);
    setProjects(prev => prev.filter(p => p.id !== project.id));
    if (selectedProject?.id === project.id) {
      setSelectedProject(null);
      setFindings([]);
    }
  }

  const filteredFindings = filterSeverity === 'all'
    ? findings
    : findings.filter(f => f.severity === filterSeverity);

  const latestScan = scans[0];
  const summary = latestScan?.summary;

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden">

      {/* Sidebar */}
      <div className="w-72 flex flex-col border-r border-white/[0.06] bg-zinc-950/50">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/[0.06]">
          <Shield className="w-5 h-5 text-red-500" />
          <span className="font-bold text-zinc-100">VulnDash</span>
          <span className="ml-auto text-xs text-zinc-600">v0.1</span>
        </div>

        {/* Add project */}
        <div className="p-3 border-b border-white/[0.06]">
          <button
            onClick={handleAddProject}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Add Local Project
          </button>
        </div>

        {/* Projects list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <p className="text-xs text-zinc-600 text-center py-4">Loading...</p>
          ) : projects.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-4">No projects yet.<br />Add a folder to get started.</p>
          ) : (
            projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                selected={selectedProject?.id === project.id}
                scanning={scanning === project.id}
                onScan={() => handleScan(project)}
                onDelete={() => handleDelete(project)}
                onSelect={() => handleSelectProject(project)}
              />
            ))
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedProject ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-600">
            <Shield className="w-16 h-16 opacity-20" />
            <p className="text-lg">Select a project to view its security status</p>
          </div>
        ) : (
          <>
            {/* Project header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-white/[0.06] bg-zinc-950/30">
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-lg text-zinc-100">{selectedProject.name}</h1>
                <p className="text-xs text-zinc-500 font-mono truncate">{selectedProject.path}</p>
              </div>
              <button
                onClick={() => handleScan(selectedProject)}
                disabled={scanning === selectedProject.id}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${scanning === selectedProject.id ? 'animate-spin' : ''}`} />
                {scanning === selectedProject.id ? 'Scanning...' : 'Run Scan'}
              </button>
            </div>

            {/* Stats bar */}
            {summary && (
              <div className="flex items-center gap-6 px-6 py-3 border-b border-white/[0.06] bg-zinc-950/20">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-xs text-zinc-400">{summary.critical} Critical</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                  <span className="text-xs text-zinc-400">{summary.high} High</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  <span className="text-xs text-zinc-400">{summary.medium} Medium</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  <span className="text-xs text-zinc-400">{summary.low} Low</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{summary.total} total findings</span>
                </div>
              </div>
            )}

            {/* Dashboard content */}
            <div className="flex-1 overflow-auto p-6">
              {findings.length === 0 && !latestScan ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-600">
                  <CheckCircle className="w-12 h-12 opacity-30" />
                  <p>No scans yet — run your first scan!</p>
                </div>
              ) : (
                <div className="flex gap-6">
                  {/* Score + summary */}
                  {selectedProject.score != null && (
                    <div className="w-48 shrink-0">
                      <ScoreGauge score={selectedProject.score} />
                    </div>
                  )}

                  {/* Findings */}
                  <div className="flex-1 min-w-0">
                    {/* Filter */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs text-zinc-500">Filter:</span>
                      {['all', 'critical', 'high', 'medium', 'low', 'info'].map(sev => (
                        <button
                          key={sev}
                          onClick={() => setFilterSeverity(sev)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            filterSeverity === sev
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-zinc-900 text-zinc-500 border border-white/[0.06] hover:text-zinc-300'
                          }`}
                        >
                          {sev.charAt(0).toUpperCase() + sev.slice(1)}
                        </button>
                      ))}
                    </div>

                    {/* Findings list */}
                    <div className="space-y-2">
                      {filteredFindings.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-400 text-sm">
                          <CheckCircle className="w-4 h-4" />
                          No {filterSeverity === 'all' ? '' : filterSeverity + ' '}findings — 
                        </div>
                      ) : (
                        filteredFindings.map(finding => (
                          <FindingCard key={finding.id} finding={finding} />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
