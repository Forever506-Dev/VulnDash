import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Shield, FolderOpen, RefreshCw, Trash2, ChevronRight, CheckCircle, GitBranch, X, Settings, Plus } from 'lucide-react';
import type { Project, Scan, Finding } from './types';
import { listProjects, addProjectLocal, addProjectGithub, deleteProject, startScan, getScanResults, listScans, autoFixDeps, exportHtmlReport, compareScansToPrevious, checkTools, scoreGrade, scoreColor, SEVERITY_COLORS, toggleWatch } from './hooks/useTauri';
import type { ToolStatus } from './hooks/useTauri';
import FindingDetailPanel from './components/FindingDetailPanel';
import { open, save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import './index.css';

// ── Score Gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const [displayScore, setDisplayScore] = useState(0);
  const color = scoreColor(displayScore);
  const grade = scoreGrade(displayScore);
  const circumference = 2 * Math.PI * 54;
  const dash = (displayScore / 100) * circumference;

  useEffect(() => {
    let start: number | null = null;
    const duration = 1000;
    const from = 0;
    const to = score;

    function step(ts: number) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      // ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [score]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke={displayScore >= 90 ? '#22c55e' : displayScore >= 75 ? '#3b82f6' : displayScore >= 60 ? '#eab308' : displayScore >= 40 ? '#f97316' : '#ef4444'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{displayScore}</span>
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

function FindingCard({ finding, onDetail }: { finding: Finding; onDetail?: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-zinc-900/60 border border-white/[0.06] rounded-xl p-4 hover:border-white/10 transition-colors"
    >
      <div className="flex items-start gap-3" onClick={() => setExpanded(!expanded)} style={{cursor:'pointer'}}>
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
          <button
            onClick={e => { e.stopPropagation(); onDetail?.(); }}
            className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-medium hover:bg-red-500/20 transition-colors"
          >
            🤖 Open in AI Coach
          </button>
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
          <p className="font-semibold text-zinc-100 truncate flex items-center gap-1.5">
            {project.github_url && <GitBranch className="w-3 h-3 text-zinc-400 shrink-0" />}
            {project.name}
          </p>
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

// ── Score Trend Chart ────────────────────────────────────────────────────────

function ScoreTrendChart({ scans }: { scans: Scan[] }) {
  // Oldest first for left-to-right progression
  const data = [...scans]
    .filter(s => s.score != null && s.finished_at != null)
    .reverse()
    .map(s => ({
      date: new Date(s.finished_at! * 1000).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
      score: s.score as number,
    }));

  if (data.length === 0) return null;

  const latestScore = data[data.length - 1]?.score ?? 0;
  const lineColor = latestScore >= 75 ? '#22c55e' : latestScore >= 50 ? '#eab308' : '#ef4444';

  return (
    <div className="bg-zinc-900/60 border border-white/[0.06] rounded-xl p-4">
      <h3 className="text-sm font-semibold text-zinc-300 mb-4">Score Trend</h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#a1a1aa' }}
            itemStyle={{ color: lineColor }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={lineColor}
            strokeWidth={2}
            dot={{ fill: lineColor, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Scan Diff Panel ──────────────────────────────────────────────────────────

function ScanDiffPanel({
  scanId,
  onClose,
}: {
  scanId: string;
  onClose: () => void;
}) {
  const [diff, setDiff] = React.useState<{
    new_findings: Finding[];
    fixed_count: number;
    score_delta: number;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    compareScansToPrevious(scanId)
      .then(setDiff)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [scanId]);

  const deltaColor = diff
    ? diff.score_delta > 0
      ? 'text-green-400'
      : diff.score_delta < 0
      ? 'text-red-400'
      : 'text-zinc-400'
    : 'text-zinc-400';

  return (
    <div className="bg-zinc-900/80 border border-white/[0.08] rounded-xl p-4 mt-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-zinc-300">Diff vs Previous Scan</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-zinc-500">Loading diff...</p>
      ) : diff ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-xs">
            <span className={`font-bold ${deltaColor}`}>
              Score delta: {diff.score_delta > 0 ? '+' : ''}{diff.score_delta}
            </span>
            <span className="text-green-400">{diff.fixed_count} fixed</span>
            <span className="text-red-400">{diff.new_findings.length} new</span>
          </div>
          {diff.fixed_count > 0 && (
            <div className="rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2">
              <p className="text-xs text-green-400 font-medium">✅ {diff.fixed_count} finding{diff.fixed_count !== 1 ? 's' : ''} resolved since last scan</p>
            </div>
          )}
          {diff.new_findings.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-red-400">New findings:</p>
              {diff.new_findings.map(f => (
                <div key={f.id} className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="text-xs text-zinc-200">{f.title}</span>
                    <span className="text-xs text-zinc-500 ml-auto">{f.tool}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {diff.new_findings.length === 0 && diff.fixed_count === 0 && (
            <p className="text-xs text-zinc-500">No changes compared to previous scan.</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Could not load diff.</p>
      )}
    </div>
  );
}

// ── History View ──────────────────────────────────────────────────────────────

function HistoryView({ scans }: { scans: Scan[] }) {
  const [selectedScanId, setSelectedScanId] = React.useState<string | null>(null);

  if (scans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-600">
        <CheckCircle className="w-12 h-12 opacity-30" />
        <p>No scans yet — run your first scan!</p>
      </div>
    );
  }

  function formatDuration(scan: Scan): string {
    if (!scan.finished_at || !scan.started_at) return '—';
    const secs = scan.finished_at - scan.started_at;
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleString('en-CA', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="space-y-4">
      <ScoreTrendChart scans={scans} />

      <div className="space-y-2">
        {scans.map(scan => {
          const score = scan.score;
          const grade = score != null ? scoreGrade(score) : '—';
          const color = score != null ? scoreColor(score) : 'text-zinc-500';
          const s = scan.summary;
          const isSelected = selectedScanId === scan.id;
          return (
            <div key={scan.id}
              className={`bg-zinc-900/60 border rounded-xl p-4 cursor-pointer transition-all ${
                isSelected ? 'border-red-500/30' : 'border-white/[0.06] hover:border-white/10'
              }`}
              onClick={() => setSelectedScanId(isSelected ? null : scan.id)}
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center w-14 shrink-0">
                  {score != null ? (
                    <>
                      <span className={`text-2xl font-bold ${color}`}>{score}</span>
                      <span className={`text-sm font-semibold ${color}`}>{grade}</span>
                    </>
                  ) : (
                    <span className="text-zinc-600 text-sm">{scan.status}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{formatDate(scan.started_at)}</p>
                  {s && (
                    <div className="flex items-center gap-3 mt-1">
                      {s.critical > 0 && <span className="text-xs text-red-400">{s.critical} crit</span>}
                      {s.high > 0 && <span className="text-xs text-orange-400">{s.high} high</span>}
                      {s.medium > 0 && <span className="text-xs text-yellow-400">{s.medium} med</span>}
                      {s.low > 0 && <span className="text-xs text-blue-400">{s.low} low</span>}
                      {s.total === 0 && <span className="text-xs text-green-400">Clean</span>}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-zinc-500">{formatDuration(scan)}</span>
                </div>
              </div>
              {isSelected && (
                <div onClick={e => e.stopPropagation()}>
                  <ScanDiffPanel scanId={scan.id} onClose={() => setSelectedScanId(null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Onboarding Screen ────────────────────────────────────────────────────────

function OnboardingScreen() {
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkTools()
      .then(setTools)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toolIcons: Record<string, string> = {
    'cargo-audit': '🦀',
    'npm': '📦',
    'pip-audit': '🐍',
    'gitleaks': '🔑',
    'git': '🌿',
    'Ollama (AI)': '🤖',
    'Ollama': '🤖',
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8 overflow-y-auto">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-zinc-100 mb-2">Welcome to VulnDash 🔐</h1>
        <p className="text-zinc-400 text-lg">Your AI-powered security scanner</p>
      </div>

      <div className="w-full max-w-2xl">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Scanner Status</h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-zinc-900/60 border border-white/[0.06] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {tools.map(tool => (
              <div
                key={tool.name}
                className={`bg-zinc-900/60 border rounded-xl p-4 transition-all ${
                  tool.available
                    ? 'border-green-500/20'
                    : 'border-orange-500/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{toolIcons[tool.name] ?? '🔧'}</span>
                  <span className="font-semibold text-zinc-100 text-sm">{tool.name}</span>
                  <span className="ml-auto text-base">
                    {tool.available ? '✅' : '⚠️'}
                  </span>
                </div>
                {tool.available ? (
                  <p className="text-xs text-zinc-500 font-mono truncate">{tool.version}</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-orange-400">{tool.install_hint}</p>
                    {tool.install_url && (
                      <a
                        href={tool.install_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-red-400 underline hover:text-red-300 font-mono"
                      >
                        {tool.install_url.replace('https://', '')}
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-zinc-600 text-sm text-center max-w-md">
        Add a local folder or GitHub repository from the sidebar to start scanning.
      </p>
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
  const [autoFixing, setAutoFixing] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'findings' | 'history'>('findings');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const [githubPat, setGithubPat] = useState(() => localStorage.getItem('vulndash_github_pat') || '');
  const [addingGithub, setAddingGithub] = useState(false);
  const [githubError, setGithubError] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  // Listen for watch:changed events and trigger rescan
  useEffect(() => {
    const unlistenPromise = listen<string>('watch:changed', (event) => {
      const projectId = event.payload;
      setProjects(prev => {
        const project = prev.find(p => p.id === projectId);
        if (project) {
          handleScan(project);
        }
        return prev;
      });
    });
    return () => { unlistenPromise.then(fn => fn()); };
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

  async function handleAddGithubProject() {
    if (!githubUrl.trim()) return;
    setAddingGithub(true);
    setGithubError('');
    try {
      // Parse URL like https://github.com/owner/repo or owner/repo
      const clean = githubUrl.trim().replace(/\.git$/, '');
      const match = clean.match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+)/);
      if (!match) {
        setGithubError('Invalid URL. Use: https://github.com/owner/repo');
        return;
      }
      const [, owner, repo] = match;
      const project = await addProjectGithub(owner, repo);
      setProjects(prev => [project, ...prev]);
      setShowGithubModal(false);
      setGithubUrl('');
    } catch (e: any) {
      setGithubError(e?.message || String(e));
    } finally {
      setAddingGithub(false);
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
    setActiveTab('findings');
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

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleAutoFix(project: Project) {
    setAutoFixing(true);
    try {
      const summary = await autoFixDeps(project.id);
      showToast(summary, 'success');
      // Trigger rescan
      await handleScan(project);
    } catch (e: any) {
      showToast(e?.message || String(e), 'error');
    } finally {
      setAutoFixing(false);
    }
  }

  async function handleToggleWatch(project: Project) {
    const current = watchEnabled[project.id] ?? false;
    const next = !current;
    try {
      await toggleWatch(project.id, next);
      setWatchEnabled(prev => ({ ...prev, [project.id]: next }));
      showToast(next ? '👁 Watch mode enabled' : 'Watch mode disabled', 'success');
    } catch (e: any) {
      showToast(e?.message || String(e), 'error');
    }
  }

  const filteredFindings = filterSeverity === 'all'
    ? findings
    : findings.filter(f => f.severity === filterSeverity);

  const hasFixableFindings = findings.some(f => f.fix_version != null && f.fix_version !== '');

  const latestScan = scans[0];
  const summary = latestScan?.summary;

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl border text-sm font-medium shadow-xl transition-all ${
          toast.type === 'success'
            ? 'bg-green-500/10 border-green-500/30 text-green-300'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      {/* GitHub Modal */}
      {showGithubModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/[0.08] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-zinc-300" />
                <h2 className="font-bold text-zinc-100">Add GitHub Repository</h2>
              </div>
              <button onClick={() => { setShowGithubModal(false); setGithubError(''); setGithubUrl(''); }} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Repository URL</label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddGithubProject()}
                  placeholder="https://github.com/owner/repo"
                  className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-red-500/40 transition-colors"
                  autoFocus
                />
              </div>
              {githubError && (
                <p className="text-xs text-red-400">{githubError}</p>
              )}
              <button
                onClick={handleAddGithubProject}
                disabled={addingGithub || !githubUrl.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {addingGithub ? 'Adding...' : 'Add Repository'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/[0.08] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-zinc-300" />
                <h2 className="font-bold text-zinc-100">Settings</h2>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">GitHub Personal Access Token</label>
                <input
                  type="password"
                  value={githubPat}
                  onChange={e => {
                    setGithubPat(e.target.value);
                    localStorage.setItem('vulndash_github_pat', e.target.value);
                  }}
                  placeholder="ghp_..."
                  className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-red-500/40 transition-colors font-mono"
                />
                <p className="text-xs text-zinc-600 mt-1.5">Used to scan private repos. Stored locally only.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-72 flex flex-col border-r border-white/[0.06] bg-zinc-950/50">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/[0.06]">
          <Shield className="w-5 h-5 text-red-500" />
          <span className="font-bold text-zinc-100">VulnDash</span>
          <button onClick={() => setShowSettings(true)} className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Add project buttons */}
        <div className="p-3 border-b border-white/[0.06] space-y-2">
          <button
            onClick={handleAddProject}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 border border-white/[0.06] text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Add Local Project
          </button>
          <button
            onClick={() => setShowGithubModal(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            <GitBranch className="w-4 h-4" />
            Add GitHub Repo
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

        {/* Sidebar footer */}
        <div className="px-4 py-3 border-t border-white/[0.06] space-y-0.5">
          <p className="text-xs text-zinc-600">VulnDash v0.1</p>
          <p className="text-xs text-zinc-700">Made with ♥ by Forever506-Dev</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedProject ? (
          projects.length === 0 && !loading ? (
            <OnboardingScreen />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-600">
              <Shield className="w-16 h-16 opacity-20" />
              <p className="text-lg">Select a project to view its security status</p>
            </div>
          )
        ) : (
          <>
            {/* Project header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-white/[0.06] bg-zinc-950/30">
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-lg text-zinc-100">{selectedProject.name}</h1>
                <p className="text-xs text-zinc-500 font-mono truncate">{selectedProject.path}</p>
              </div>
              {scans.length > 0 && (
                <button
                  onClick={async () => {
                    const path = await save({ defaultPath: 'vulndash-report.html', filters: [{ name: 'HTML', extensions: ['html'] }] });
                    if (path) await exportHtmlReport(selectedProject.id, scans[0].id, path);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 border border-white/[0.06] text-sm font-semibold hover:bg-zinc-700 transition-colors"
                >
                  Export Report
                </button>
              )}
              <button
                onClick={() => handleScan(selectedProject)}
                disabled={scanning === selectedProject.id}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${scanning === selectedProject.id ? 'animate-spin' : ''}`} />
                {scanning === selectedProject.id ? 'Scanning...' : 'Run Scan'}
              </button>
              {hasFixableFindings && (
                <button
                  onClick={() => handleAutoFix(selectedProject)}
                  disabled={autoFixing || scanning === selectedProject.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 text-sm font-semibold hover:bg-green-500/20 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className={`w-4 h-4 ${autoFixing ? 'animate-pulse' : ''}`} />
                  {autoFixing ? 'Fixing...' : 'Auto-fix'}
                </button>
              )}
              {/* Watch Mode toggle */}
              <button
                onClick={() => handleToggleWatch(selectedProject)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors border ${
                  watchEnabled[selectedProject.id]
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-zinc-800 text-zinc-400 border-white/[0.06] hover:bg-zinc-700'
                }`}
                title={watchEnabled[selectedProject.id] ? 'Disable watch mode' : 'Enable watch mode'}
              >
                <span className={watchEnabled[selectedProject.id] ? 'animate-pulse' : ''}>👁</span>
                Watch
              </button>
            </div>

            {/* Tab toggle */}
            <div className="flex items-center gap-1 px-6 py-3 border-b border-white/[0.06]">
              <button
                onClick={() => setActiveTab('findings')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'findings'
                    ? 'bg-zinc-800 text-zinc-100 border border-white/10'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Findings
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'history'
                    ? 'bg-zinc-800 text-zinc-100 border border-white/10'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                History
              </button>
            </div>

            {/* Dashboard content */}
            <div className="flex-1 overflow-auto p-6">
              {activeTab === 'history' ? (
                <HistoryView scans={scans} />
              ) : findings.length === 0 && !latestScan ? (
                <div className="flex flex-col items-center justify-center h-full gap-6 text-zinc-600">
                  <div className="text-6xl animate-bounce">🚀</div>
                  <div className="text-center">
                    <p className="text-xl font-semibold text-zinc-400 mb-2">Run your first scan</p>
                    <p className="text-zinc-600 text-sm">Click the button above to start scanning this project</p>
                  </div>
                  <div className="flex items-center gap-2 text-red-400 font-semibold animate-pulse">
                    <span>Run your first scan</span>
                    <span className="text-xl">→</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Score header — full width, compact */}
                  {selectedProject.score != null && (
                    <div className="flex items-center gap-6 bg-zinc-900/40 border border-white/[0.06] rounded-2xl px-6 py-4">
                      <ScoreGauge score={selectedProject.score} />
                      {summary && (
                        <div className="flex flex-wrap gap-4 flex-1">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-2xl font-bold text-red-500">{summary.critical}</span>
                            <span className="text-xs text-zinc-500">Critical</span>
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-2xl font-bold text-orange-400">{summary.high}</span>
                            <span className="text-xs text-zinc-500">High</span>
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-2xl font-bold text-yellow-400">{summary.medium}</span>
                            <span className="text-xs text-zinc-500">Medium</span>
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-2xl font-bold text-blue-400">{summary.low}</span>
                            <span className="text-xs text-zinc-500">Low</span>
                          </div>
                          <div className="flex flex-col items-center gap-0.5 ml-auto">
                            <span className="text-2xl font-bold text-zinc-300">{summary.total}</span>
                            <span className="text-xs text-zinc-500">Total</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Findings — full width */}
                  <div className="w-full">
                    {/* Filter */}
                    <div className="flex items-center gap-2 mb-3">
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
                        findings.length === 0 && latestScan ? (
                          <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <div className="relative">
                              <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                                <CheckCircle className="w-10 h-10 text-green-400" />
                              </div>
                              <span className="absolute -top-1 -right-1 text-2xl">🎉</span>
                            </div>
                            <p className="text-xl font-semibold text-green-400">🎉 All clear! No vulnerabilities found.</p>
                            <p className="text-zinc-600 text-sm">Your project passed all security checks.</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-green-400 text-sm">
                            <CheckCircle className="w-4 h-4" />
                            No {filterSeverity === 'all' ? '' : filterSeverity + ' '}findings
                          </div>
                        )
                      ) : (
                        filteredFindings.map(finding => (
                          <FindingCard key={finding.id} finding={finding} onDetail={() => setSelectedFinding(finding)} />
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
      {selectedFinding && (
        <FindingDetailPanel finding={selectedFinding} onClose={() => setSelectedFinding(null)} />
      )}
    </div>
  );
}
