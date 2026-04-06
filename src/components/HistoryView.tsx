import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CheckCircle, X } from 'lucide-react';
import type { Scan, Finding } from '../types';
import { scoreColor, scoreGrade, compareScansToPrevious } from '../hooks/useTauri';
import SeverityBadge from './SeverityBadge';

// ── Score Trend Chart ────────────────────────────────────────────────────────

function ScoreTrendChart({ scans }: { scans: Scan[] }) {
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

function ScanDiffPanel({ scanId, onClose }: { scanId: string; onClose: () => void }) {
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
    ? diff.score_delta > 0 ? 'text-green-400'
    : diff.score_delta < 0 ? 'text-red-400'
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

export default function HistoryView({ scans }: { scans: Scan[] }) {
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
