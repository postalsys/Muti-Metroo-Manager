import type { DashboardRouteInfo } from '../api/types';

interface RouteTableProps {
  routes: DashboardRouteInfo[] | null;
  onHighlight: (pathIds: string[]) => void;
  onClearHighlight: () => void;
}

export default function RouteTable({ routes, onHighlight, onClearHighlight }: RouteTableProps) {
  return (
    <section>
      <h2>Route Table</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Exit Node</th>
              <th>Proto</th>
              <th>Hops</th>
            </tr>
          </thead>
          <tbody>
            {!routes || routes.length === 0 ? (
              <tr>
                <td colSpan={4} className="no-data">No routes</td>
              </tr>
            ) : (
              routes.map((route, i) => (
                <tr
                  key={i}
                  className="route-row"
                  onMouseEnter={() => onHighlight(route.path_ids || [])}
                  onMouseLeave={onClearHighlight}
                >
                  <td className={route.route_type === 'domain' ? 'route-domain' : 'route-cidr'}>
                    {route.route_type === 'domain' ? '@' : ''}{route.network}
                  </td>
                  <td title={route.origin_id}>{route.origin}</td>
                  <td className="proto-cell">
                    {route.tcp && <span className="proto-badge proto-tcp">TCP</span>}
                    {route.udp && <span className="proto-badge proto-udp">UDP</span>}
                  </td>
                  <td title={route.path_display?.join(' → ') || ''}>{route.hop_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
