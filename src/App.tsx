import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, GitBranch, X, Settings, Plus } from 'lucide-react';
import type { Project, Scan, Finding } from './types';
import {
  listProjects, addProjectLocal, addProjectGithub, deleteProject,
  startScan, getScanResults, listScans, autoFixDeps, exportHtmlReport,
  toggleWatch,
} from './hooks/useTauri';
import FindingDetailPanel from './components/FindingDetailPanel';
import ScoreGauge from './components/ScoreGauge';
import FindingCard from './components/FindingCard';
import HistoryView from './components/HistoryView';
import OnboardingScreen from './components/OnboardingScreen';
import Sidebar from './components/Sidebar';
import { open, save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import './index.css';

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

  useEffect(() => {
    const unlistenPromise = listen<string>('watch:changed', (event) => {
      const projectId = event.payload;
      setProjects(prev => {
        const project = prev.find(p => p.id === projectId);
        if (project) handleScan(project);
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
              {githubError && <p className="text-xs text-red-400">{githubError}</p>}
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
      <Sidebar
        projects={projects}
        selectedProject={selectedProject}
        scanning={scanning}
        loading={loading}
        onSelectProject={handleSelectProject}
        onScanProject={handleScan}
        onDeleteProject={handleDelete}
        onAddLocalProject={handleAddProject}
        onShowGithubModal={() => setShowGithubModal(true)}
        onShowSettings={() => setShowSettings(true)}
        onLogoClick={() => setSelectedProject(null)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedProject ? (
          <OnboardingScreen />
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
