import type { Stats, DashboardRouteInfo } from '../api/types';

interface StatsPanelProps {
  stats: Stats | null;
  routes: DashboardRouteInfo[] | null;
}

export default function StatsPanel({ stats, routes }: StatsPanelProps) {
  const exitNodes = new Set(routes?.map(r => r.origin_id) || []);

  return (
    <section className="stats-panel">
      <div className="stat-card">
        <div className="stat-value">{stats?.peer_count ?? '-'}</div>
        <div className="stat-label">Peers</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{stats?.stream_count ?? '-'}</div>
        <div className="stat-label">Streams</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{exitNodes.size || '-'}</div>
        <div className="stat-label">Exit Nodes</div>
      </div>
    </section>
  );
}
