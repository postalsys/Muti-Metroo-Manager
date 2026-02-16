import type { DashboardPortForwardRouteInfo } from '../api/types';

interface ForwardRouteTableProps {
  routes: DashboardPortForwardRouteInfo[] | null;
  onHighlight: (pathIds: string[]) => void;
  onClearHighlight: () => void;
}

export default function ForwardRouteTable({ routes, onHighlight, onClearHighlight }: ForwardRouteTableProps) {
  if (!routes || routes.length === 0) return null;

  return (
    <section>
      <h2>Port Forward Routes</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Ingress</th>
              <th>Listener</th>
              <th>Exit</th>
              <th>Target</th>
              <th>Hops</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route, i) => (
              <tr
                key={i}
                className="route-row"
                onMouseEnter={() => onHighlight(route.path_ids || [])}
                onMouseLeave={onClearHighlight}
              >
                <td className="route-key"><code>{route.key}</code></td>
                <td title={route.ingress_agent_id}>{route.ingress_agent}</td>
                <td><code>{route.listener_address || '-'}</code></td>
                <td title={route.exit_agent_id}>{route.exit_agent}</td>
                <td><code>{route.target || '-'}</code></td>
                <td title={route.path_display?.join(' → ') || ''}>{route.hop_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
