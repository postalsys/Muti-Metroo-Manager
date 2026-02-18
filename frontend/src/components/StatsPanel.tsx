import type { Stats, TopologyAgentInfo } from '../api/types';

interface StatsPanelProps {
  stats: Stats | null;
  agents: TopologyAgentInfo[];
}

export default function StatsPanel({ stats, agents }: StatsPanelProps) {
  const ingressCount = agents.filter(a => a.roles?.includes('ingress')).length;
  const transitCount = agents.filter(a => a.roles?.includes('transit')).length;
  const exitCount = agents.filter(a => a.roles?.includes('exit')).length;

  return (
    <section className="stats-panel">
      <div className="stat-card">
        <div className="stat-value">{agents.length || '-'}</div>
        <div className="stat-label">Agents</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{ingressCount || '-'}</div>
        <div className="stat-label">Ingress</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{transitCount || '-'}</div>
        <div className="stat-label">Transit</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{exitCount || '-'}</div>
        <div className="stat-label">Exit</div>
      </div>
    </section>
  );
}
