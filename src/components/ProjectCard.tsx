import { GitBranch, RefreshCw, Trash2 } from 'lucide-react';
import type { Project } from '../types';
import { scoreColor } from '../hooks/useTauri';

interface ProjectCardProps {
  project: Project;
  onScan: () => void;
  onDelete: () => void;
  onSelect: () => void;
  selected: boolean;
  scanning: boolean;
}

export default function ProjectCard({ project, onScan, onDelete, onSelect, selected, scanning }: ProjectCardProps) {
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
