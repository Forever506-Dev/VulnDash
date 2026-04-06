import { useState, useEffect } from 'react';
import { checkTools, installTool } from '../hooks/useTauri';
import type { ToolStatus } from '../hooks/useTauri';

const toolIcons: Record<string, string> = {
  'cargo-audit': '🦀',
  'npm': '📦',
  'pip-audit': '🐍',
  'gitleaks': '🔑',
  'git': '🌿',
  'Ollama (AI)': '🤖',
  'Ollama': '🤖',
};

export default function OnboardingScreen() {
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [installMessages, setInstallMessages] = useState<Record<string, { text: string; ok: boolean }>>({});

  const refreshTools = () => {
    setLoading(true);
    checkTools()
      .then(setTools)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshTools();
  }, []);

  const handleInstall = async (toolName: string) => {
    setInstalling(prev => ({ ...prev, [toolName]: true }));
    setInstallMessages(prev => ({ ...prev, [toolName]: { text: '', ok: true } }));
    try {
      const msg = await installTool(toolName);
      setInstallMessages(prev => ({ ...prev, [toolName]: { text: msg, ok: true } }));
      refreshTools();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setInstallMessages(prev => ({ ...prev, [toolName]: { text: errMsg, ok: false } }));
    } finally {
      setInstalling(prev => ({ ...prev, [toolName]: false }));
    }
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
                  tool.available ? 'border-green-500/20' : 'border-orange-500/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{toolIcons[tool.name] ?? '🔧'}</span>
                  <span className="font-semibold text-zinc-100 text-sm">{tool.name}</span>
                  <span className="ml-auto text-base">{tool.available ? '✅' : '⚠️'}</span>
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
                    {tool.install_url && (
                      <button
                        onClick={() => handleInstall(tool.name)}
                        disabled={installing[tool.name]}
                        className="mt-1 w-full text-xs px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {installing[tool.name] ? '⏳ Installing…' : '⬇ Install'}
                      </button>
                    )}
                    {installMessages[tool.name]?.text && (
                      <p className={`text-xs mt-1 whitespace-pre-wrap ${installMessages[tool.name].ok ? 'text-green-400' : 'text-red-400'}`}>
                        {installMessages[tool.name].text}
                      </p>
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
