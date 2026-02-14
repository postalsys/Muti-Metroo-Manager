import type { TopologyAgentInfo, TopologyConnection } from '../../api/types';

export interface PositionedAgent extends TopologyAgentInfo {
  x: number;
  y: number;
  labelPos: 'above' | 'below' | 'left' | 'right';
}

const GRID_SIZE = 200;

const DIRECTIONS = [
  { dx: 1, dy: 0 },   // East
  { dx: 1, dy: 1 },   // Southeast
  { dx: 1, dy: -1 },  // Northeast
  { dx: 0, dy: 1 },   // South
  { dx: 0, dy: -1 },  // North
  { dx: -1, dy: 0 },  // West
  { dx: -1, dy: 1 },  // Southwest
  { dx: -1, dy: -1 }, // Northwest
];

export function calculateTreeLayout(
  agents: TopologyAgentInfo[],
  connections: TopologyConnection[],
): PositionedAgent[] {
  if (agents.length === 0) return [];

  const localAgent = agents.find(a => a.is_local);
  if (!localAgent) return agents.map(a => ({ ...a, x: 0, y: 0, labelPos: 'above' as const }));

  // Build adjacency list
  const adjacency = new Map<string, Set<string>>();
  for (const agent of agents) {
    adjacency.set(agent.short_id, new Set());
  }
  for (const conn of connections) {
    adjacency.get(conn.from_agent)?.add(conn.to_agent);
    adjacency.get(conn.to_agent)?.add(conn.from_agent);
  }

  // BFS layout
  const positioned = new Set<string>();
  const positions = new Map<string, { x: number; y: number }>();
  const usedPositions = new Set<string>();

  positions.set(localAgent.short_id, { x: 0, y: 0 });
  positioned.add(localAgent.short_id);
  usedPositions.add('0,0');

  const queue = [{ id: localAgent.short_id, x: 0, y: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = Array.from(adjacency.get(current.id) || []).sort();

    let dirIndex = 0;
    for (const neighborId of neighbors) {
      if (positioned.has(neighborId)) continue;

      let newX = 0, newY = 0;
      let found = false;

      for (let attempt = 0; attempt < DIRECTIONS.length; attempt++) {
        const dir = DIRECTIONS[(dirIndex + attempt) % DIRECTIONS.length];
        newX = current.x + dir.dx;
        newY = current.y + dir.dy;
        const posKey = `${newX},${newY}`;

        if (!usedPositions.has(posKey)) {
          usedPositions.add(posKey);
          found = true;
          break;
        }
      }

      if (!found) {
        for (let dx = 1; dx <= 3; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            newX = current.x + dx;
            newY = current.y + dy;
            const posKey = `${newX},${newY}`;
            if (!usedPositions.has(posKey)) {
              usedPositions.add(posKey);
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }

      if (found) {
        positions.set(neighborId, { x: newX, y: newY });
        positioned.add(neighborId);
        queue.push({ id: neighborId, x: newX, y: newY });
      }

      dirIndex++;
    }
  }

  // Calculate bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  positions.forEach(pos => {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
  });

  const centerOffsetX = (minX + maxX) / 2;
  const centerOffsetY = (minY + maxY) / 2;

  // Assign label positions
  const labelPositions = new Map<string, 'above' | 'below' | 'left' | 'right'>();
  for (const agent of agents) {
    const pos = positions.get(agent.short_id);
    if (!pos) {
      labelPositions.set(agent.short_id, 'above');
      continue;
    }

    const neighbors = adjacency.get(agent.short_id) || new Set();
    let hasAbove = false, hasBelow = false, hasLeft = false, hasRight = false;

    neighbors.forEach(nId => {
      const nPos = positions.get(nId);
      if (nPos) {
        if (nPos.y < pos.y) hasAbove = true;
        if (nPos.y > pos.y) hasBelow = true;
        if (nPos.x < pos.x) hasLeft = true;
        if (nPos.x > pos.x) hasRight = true;
      }
    });

    if (!hasAbove) labelPositions.set(agent.short_id, 'above');
    else if (!hasBelow) labelPositions.set(agent.short_id, 'below');
    else if (!hasLeft) labelPositions.set(agent.short_id, 'left');
    else if (!hasRight) labelPositions.set(agent.short_id, 'right');
    else labelPositions.set(agent.short_id, 'above');
  }

  return agents.map(agent => {
    const pos = positions.get(agent.short_id);
    return {
      ...agent,
      x: pos ? (pos.x - centerOffsetX) * GRID_SIZE : 0,
      y: pos ? (pos.y - centerOffsetY) * GRID_SIZE : 0,
      labelPos: labelPositions.get(agent.short_id) || 'above',
    };
  });
}

export function createMetroPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (Math.abs(dx) < 10 || Math.abs(dy) < 10) {
    return `M${x1},${y1} L${x2},${y2}`;
  }

  const diagonalLength = Math.min(Math.abs(dx), Math.abs(dy));
  const midX = x1 + (Math.abs(dx) - diagonalLength) * Math.sign(dx);
  return `M${x1},${y1} H${midX} L${x2},${y2}`;
}

export function hashTopology(agents: TopologyAgentInfo[], connections: TopologyConnection[]): string {
  const agentIds = agents.map(a => a.short_id).sort().join(',');
  const connIds = connections.map(c => `${c.from_agent}-${c.to_agent}`).sort().join(',');
  return `${agentIds}|${connIds}`;
}

export function calculateViewBox(agents: PositionedAgent[]): string {
  if (agents.length === 0) return '0 0 1000 600';

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const agent of agents) {
    minX = Math.min(minX, agent.x);
    maxX = Math.max(maxX, agent.x);
    minY = Math.min(minY, agent.y);
    maxY = Math.max(maxY, agent.y);
  }

  const padding = 100;
  minX -= padding;
  maxX += padding;
  minY -= padding;
  maxY += padding;

  const width = maxX - minX;
  const height = Math.max(maxY - minY, 150);

  return `${minX} ${minY} ${width} ${height}`;
}
