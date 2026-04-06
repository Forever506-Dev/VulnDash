import { Shield, FolderOpen, GitBranch, Settings } from 'lucide-react';
import type { Project } from '../types';
import ProjectCard from './ProjectCard';

interface SidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  scanning: string | null;
  loading: boolean;
  onSelectProject: (project: Project) => void;
  onScanProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onAddLocalProject: () => void;
  onShowGithubModal: () => void;
  onShowSettings: () => void;
  onLogoClick: () => void;
}

export default function Sidebar({
  projects,
  selectedProject,
  scanning,
  loading,
  onSelectProject,
  onScanProject,
  onDeleteProject,
  onAddLocalProject,
  onShowGithubModal,
  onShowSettings,
  onLogoClick,
}: SidebarProps) {
  return (
    <div className="w-72 flex flex-col border-r border-white/[0.06] bg-zinc-950/50">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/[0.06]">
        <button
          onClick={onLogoClick}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          title="System Status"
        >
          <Shield className="w-5 h-5 text-red-500" />
          <span className="font-bold text-zinc-100">VulnDash</span>
        </button>
        <button onClick={onShowSettings} className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Add project buttons */}
      <div className="p-3 border-b border-white/[0.06] space-y-2">
        <button
          onClick={onAddLocalProject}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 border border-white/[0.06] text-sm font-medium hover:bg-zinc-700 transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          Add Local Project
        </button>
        <button
          onClick={onShowGithubModal}
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
              onScan={() => onScanProject(project)}
              onDelete={() => onDeleteProject(project)}
              onSelect={() => onSelectProject(project)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/[0.06] space-y-0.5">
        <p className="text-xs text-zinc-600">VulnDash v0.1</p>
        <p className="text-xs text-zinc-700">Made with ♥ by Forever506-Dev</p>
      </div>
    </div>
  );
}
