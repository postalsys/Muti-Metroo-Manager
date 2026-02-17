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
      {stats?.socks5_running && (
        <div className="stat-card stat-card-active">
          <div className="stat-value">ON</div>
          <div className="stat-label">SOCKS5</div>
        </div>
      )}
      {stats?.exit_handler_running && (
        <div className="stat-card stat-card-active">
          <div className="stat-value">ON</div>
          <div className="stat-label">Exit Handler</div>
        </div>
      )}
    </section>
  );
}
