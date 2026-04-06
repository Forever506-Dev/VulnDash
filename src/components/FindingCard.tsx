import { useState } from 'react';
import { ChevronRight, CheckCircle } from 'lucide-react';
import type { Finding } from '../types';
import SeverityBadge from './SeverityBadge';

interface FindingCardProps {
  finding: Finding;
  onDetail?: () => void;
}

export default function FindingCard({ finding, onDetail }: FindingCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-zinc-900/60 border border-white/[0.06] rounded-xl p-4 hover:border-white/10 transition-colors">
      <div className="flex items-start gap-3" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
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
