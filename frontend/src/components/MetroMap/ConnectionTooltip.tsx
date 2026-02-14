import type { TopologyConnection } from '../../api/types';
import type { PositionedAgent } from './layout';

interface ConnectionTooltipProps {
  from: PositionedAgent | null;
  to: PositionedAgent | null;
  conn: TopologyConnection | null;
  position: { x: number; y: number };
}

const TRANSPORT_NAMES: Record<string, string> = {
  quic: 'QUIC',
  h2: 'HTTP/2',
  ws: 'WebSocket',
};

export default function ConnectionTooltip({ from, to, conn, position }: ConnectionTooltipProps) {
  if (!from || !to || !conn) return null;

  const fromName = from.display_name || from.short_id;
  const toName = to.display_name || to.short_id;

  return (
    <div className="connection-tooltip" style={{ left: position.x, top: position.y }}>
      <div className="connection-direction">
        <span>{fromName}</span>
        <svg className="connection-arrow" viewBox="0 0 24 24" width="16" height="16">
          <path d="M4 12h14m-4-4l4 4-4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{toName}</span>
      </div>
      <div className="connection-role">
        {fromName} (dialer) connects to {toName} (listener)
      </div>
      {conn.transport && (
        <div className="connection-transport">
          Transport: {TRANSPORT_NAMES[conn.transport] || conn.transport.toUpperCase()}
        </div>
      )}
      {conn.rtt_ms > 0 && (
        <div className="connection-rtt">RTT: {conn.rtt_ms}ms</div>
      )}
      {conn.unresponsive && (
        <div className="connection-rtt" style={{ color: '#dc3545', fontWeight: 600 }}>
          UNRESPONSIVE (RTT &gt; 60s)
        </div>
      )}
    </div>
  );
}
