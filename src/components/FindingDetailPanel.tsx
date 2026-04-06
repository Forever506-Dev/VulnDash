import { useEffect, useRef, useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { X, Bot, Loader2, AlertTriangle, Copy, Check } from 'lucide-react';
import { appDataDir } from '@tauri-apps/api/path';
import type { Finding } from '../types';
import { readFileContext, getAiFix } from '../hooks/useTauri';
import { SEVERITY_COLORS } from '../types';

interface Props {
  finding: Finding;
  onClose: () => void;
}

interface AiFix {
  available: boolean;
  model?: string;
  explanation: string;
  fix_suggestion: string;
  fixed_code?: string;
}

interface FileCtx {
  content: string;
  language: string;
  total_lines: number;
  target_line?: number;
}

export default function FindingDetailPanel({ finding, onClose }: Props) {
  const [fileCtx, setFileCtx] = useState<FileCtx | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [aiFix, setAiFix] = useState<AiFix | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!finding.file_path) {
      setFileError('no-path');
      return;
    }
    readFileContext(finding.file_path, finding.line_number ?? undefined)
      .then(setFileCtx)
      .catch(() => setFileError('unreadable'));
  }, [finding.id]);

  function handleEditorMount(ed: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) {
    editorRef.current = ed;
    monacoRef.current = monaco;
    applyHighlight(ed, monaco);
  }

  function applyHighlight(ed: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) {
    const line = finding.line_number;
    if (!line) return;
    const newDecorations = ed.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'vuln-line-highlight',
          glyphMarginClassName: 'vuln-glyph',
          overviewRuler: {
            color: '#e53535',
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      },
    ]);
    decorationsRef.current = newDecorations;
    ed.revealLineInCenter(line);
  }

  async function handleGetAiFix() {
    setAiLoading(true);
    setAiError(null);
    try {
      const dir = await appDataDir();
      const dbPath = dir + '/vulndash.db';
      const fix = await getAiFix(finding.id, dbPath);
      setAiFix(fix);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  }

  async function handleCopyFix() {
    const text = aiFix?.fixed_code || aiFix?.fix_suggestion || '';
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const severityColors = SEVERITY_COLORS[finding.severity];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 w-full max-w-3xl bg-[#09090b] border-l border-white/[0.08] z-50 flex flex-col shadow-2xl"
        style={{ animation: 'slideInRight 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${severityColors}`}>
                {finding.severity.toUpperCase()}
              </span>
              <span className="text-xs text-zinc-500 font-mono bg-zinc-800 px-2 py-0.5 rounded">
                {finding.tool}
              </span>
              {finding.cve_id && (
                <span className="text-xs text-zinc-400 font-mono">{finding.cve_id}</span>
              )}
            </div>
            <h2 className="text-base font-semibold text-zinc-100 leading-snug">{finding.title}</h2>
            {finding.file_path && (
              <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
                📄 {finding.file_path}{finding.line_number ? `:${finding.line_number}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        {finding.description && (
          <div className="px-5 py-3 border-b border-white/[0.06] shrink-0">
            <p className="text-xs text-zinc-400 leading-relaxed">{finding.description}</p>
          </div>
        )}

        {/* Monaco Editor */}
        <div className="shrink-0 border-b border-white/[0.06]" style={{ height: '40%' }}>
          {fileError === 'no-path' ? (
            <div className="h-full flex items-center justify-center gap-2 text-zinc-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">No file path associated with this finding</span>
            </div>
          ) : fileError === 'unreadable' ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-600 px-4 text-center">
              <AlertTriangle className="w-5 h-5 text-zinc-500" />
              <span className="text-sm text-zinc-400">File not available for remote projects</span>
              <span className="text-xs text-zinc-600">Clone the repository locally to view source code</span>
            </div>
          ) : !fileCtx ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
            </div>
          ) : (
            <>
              <style>{`
                .vuln-line-highlight { background: rgba(229, 53, 53, 0.15); border-left: 3px solid #e53535; }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
              `}</style>
              <Editor
                height="100%"
                language={fileCtx.language}
                value={fileCtx.content}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  lineNumbers: 'on',
                  glyphMargin: true,
                  folding: false,
                  renderLineHighlight: 'none',
                  scrollbar: { verticalScrollbarSize: 6 },
                }}
                onMount={handleEditorMount}
              />
            </>
          )}
        </div>

        {/* AI Coach */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-red-400" />
              <span className="text-sm font-semibold text-zinc-200">AI Coach</span>
              {aiFix?.model && (
                <span className="text-xs text-zinc-600 font-mono">({aiFix.model})</span>
              )}
            </div>
            {!aiFix && (
              <button
                onClick={handleGetAiFix}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {aiLoading ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
                ) : (
                  <>Get AI Fix ▶</>
                )}
              </button>
            )}
          </div>

          {aiError && (
            <div className="rounded-xl bg-red-500/5 border border-red-500/20 px-4 py-3 mb-4">
              {aiError.toLowerCase().includes('ollama') || aiError.toLowerCase().includes('connect') ? (
                <div className="space-y-1">
                  <p className="text-sm text-red-400 font-medium">Ollama not running</p>
                  <p className="text-xs text-zinc-500">
                    Install Ollama for AI suggestions:{' '}
                    <a
                      href="https://ollama.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-400 underline hover:text-red-300"
                    >
                      ollama.ai
                    </a>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-red-400">{aiError}</p>
              )}
            </div>
          )}

          {aiFix && (
            <div className="space-y-4">
              {!aiFix.available && (
                <div className="rounded-xl bg-zinc-800/60 border border-white/[0.06] px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-xs font-medium text-yellow-400">Ollama not available — rule-based suggestion</span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Install Ollama for AI-powered analysis:{' '}
                    <a
                      href="https://ollama.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-400 underline hover:text-red-300"
                    >
                      ollama.ai
                    </a>
                  </p>
                </div>
              )}

              {/* Explanation */}
              <div className="rounded-xl bg-zinc-900/60 border border-white/[0.06] p-4">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Explanation</p>
                <p className="text-sm text-zinc-200 leading-relaxed">{aiFix.explanation}</p>
              </div>

              {/* Fix suggestion */}
              <div className="rounded-xl bg-zinc-900/60 border border-red-500/20 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Fix Suggestion</p>
                  <button
                    onClick={handleCopyFix}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {copied ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{aiFix.fix_suggestion}</p>
              </div>

              {/* Fixed code snippet */}
              {aiFix.fixed_code && (
                <div className="rounded-xl bg-zinc-950 border border-green-500/20 p-4">
                  <p className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">Fixed Code</p>
                  <pre className="text-xs text-zinc-200 font-mono overflow-x-auto whitespace-pre-wrap">{aiFix.fixed_code}</pre>
                </div>
              )}

              {/* Re-run */}
              <button
                onClick={handleGetAiFix}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-white/[0.06] text-xs font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {aiLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> Regenerating...</> : '↺ Regenerate'}
              </button>
            </div>
          )}

          {!aiFix && !aiLoading && !aiError && (
            <div className="rounded-xl bg-zinc-900/40 border border-white/[0.04] p-6 flex flex-col items-center gap-3 text-center">
              <Bot className="w-8 h-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">Click "Get AI Fix" to get an AI-powered explanation and fix suggestion</p>
              <p className="text-xs text-zinc-600">Requires Ollama running locally</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
