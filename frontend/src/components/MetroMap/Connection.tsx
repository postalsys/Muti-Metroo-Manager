import { useCallback } from 'react';
import type { TopologyConnection } from '../../api/types';
import type { PositionedAgent } from './layout';
import { createMetroPath } from './layout';

interface ConnectionProps {
  from: PositionedAgent;
  to: PositionedAgent;
  conn: TopologyConnection;
  highlightState: 'none' | 'highlighted' | 'dimmed';
  onHover: (e: React.MouseEvent, from: PositionedAgent, to: PositionedAgent, conn: TopologyConnection) => void;
  onMove: (e: React.MouseEvent) => void;
  onLeave: () => void;
}

export default function Connection({ from, to, conn, highlightState, onHover, onMove, onLeave }: ConnectionProps) {
  const d = createMetroPath(from.x, from.y, to.x, to.y);

  let connClass = `connection ${conn.is_direct ? 'direct' : 'indirect'}`;
  if (conn.unresponsive) connClass += ' unresponsive';

  let groupClass = 'connection-group';
  if (highlightState === 'highlighted') groupClass += ' path-highlighted';
  if (highlightState === 'dimmed') groupClass += ' path-dimmed';

  const handleEnter = useCallback((e: React.MouseEvent) => {
    onHover(e, from, to, conn);
  }, [from, to, conn, onHover]);

  return (
    <g
      className={groupClass}
      data-from-id={from.short_id}
      data-to-id={to.short_id}
      onMouseEnter={handleEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <path d={d} className={connClass} />
    </g>
  );
}
