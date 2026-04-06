import { SEVERITY_COLORS } from '../hooks/useTauri';
import type { Finding } from '../types';

export default function SeverityBadge({ severity }: { severity: Finding['severity'] }) {
  const colors = SEVERITY_COLORS[severity];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${colors}`}>
      {severity.toUpperCase()}
    </span>
  );
}
