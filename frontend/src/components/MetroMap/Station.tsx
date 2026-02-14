import { useCallback } from 'react';
import type { MeshTestResult } from '../../api/types';
import type { PositionedAgent } from './layout';

const STATION_RADIUS = 14;
const LOCAL_STATION_RADIUS = 18;
const ROLE_RADIUS_BASE_OFFSET = 4;
const ROLE_SPACING = 5;

interface StationProps {
  agent: PositionedAgent;
  meshResult: MeshTestResult | undefined;
  highlightState: 'none' | 'highlighted' | 'dimmed';
  selected: boolean;
  onHover: (agent: PositionedAgent, element: SVGGElement) => void;
  onLeave: () => void;
  onClick: (agentId: string) => void;
}

export default function Station({ agent, meshResult, highlightState, selected, onHover, onLeave, onClick }: StationProps) {
  const radius = agent.is_local ? LOCAL_STATION_RADIUS : STATION_RADIUS;
  const roles = agent.roles || ['transit'];
  const roleRadiusBase = radius + ROLE_RADIUS_BASE_OFFSET;

  const stationType = agent.is_local ? 'local' : (agent.is_connected ? 'connected' : 'remote');

  let className = `station ${stationType}`;
  if (selected) className += ' selected';
  if (highlightState === 'highlighted') className += ' path-highlighted';
  if (highlightState === 'dimmed') className += ' path-dimmed';
  if (meshResult) {
    className += meshResult.reachable ? ' reachable' : ' unreachable';
  }

  const handleMouseEnter = useCallback((e: React.MouseEvent<SVGGElement>) => {
    onHover(agent, e.currentTarget);
  }, [agent, onHover]);

  const handleClick = useCallback(() => {
    onClick(agent.short_id);
  }, [agent.short_id, onClick]);

  // Label position accounting for role rings
  const totalRoleRadius = roleRadiusBase + (roles.length - 1) * ROLE_SPACING;
  const labelProps: Record<string, string | number> = {};

  switch (agent.labelPos) {
    case 'above':
      labelProps.y = -(totalRoleRadius + 6);
      break;
    case 'below':
      labelProps.y = totalRoleRadius + 16;
      break;
    case 'left':
      labelProps.x = -(totalRoleRadius + 6);
      labelProps.y = 4;
      break;
    case 'right':
      labelProps.x = totalRoleRadius + 6;
      labelProps.y = 4;
      break;
  }

  // Render role circles from outermost to innermost
  const sortedRoles = [...roles].reverse();

  return (
    <g
      className={className}
      transform={`translate(${agent.x},${agent.y})`}
      data-agent-id={agent.short_id}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
      onClick={handleClick}
    >
      {sortedRoles.map((role, index) => (
        <circle
          key={role}
          className={`station-role ${role}`}
          r={roleRadiusBase + (sortedRoles.length - 1 - index) * ROLE_SPACING}
        />
      ))}
      <circle className="station-outer" r={radius} />
      <circle className="station-inner" r={radius - 4} />
      <text className={`station-label ${agent.labelPos}`} {...labelProps}>
        {agent.display_name || agent.short_id}
      </text>
    </g>
  );
}
