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

// ---- Metro path routing: 45° diagonal transitions with collision avoidance ----

const CORNER_RADIUS = 20;
const COS45 = Math.SQRT1_2;
const STATION_CLEARANCE = 25;
const COLLINEAR_OFFSET = 40;

type Point = { x: number; y: number };
type Segment = [number, number, number, number];

interface PathResult {
  d: string;
  segments: Segment[];
}

function segmentPassesNearPoint(
  ax: number, ay: number, bx: number, by: number,
  px: number, py: number, clearance: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay) < clearance;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) < clearance;
}

function pathCollides(segments: Segment[], stations: Point[], clearance: number): boolean {
  for (const [ax, ay, bx, by] of segments) {
    for (const { x: px, y: py } of stations) {
      if (segmentPassesNearPoint(ax, ay, bx, by, px, py, clearance)) return true;
    }
  }
  return false;
}

/**
 * Build a two-segment metro path: one straight axis-aligned segment and one 45° diagonal,
 * connected by a rounded corner. The `straightFirst` flag controls the order.
 *
 * straightFirst = true:  straight along longer axis, then diagonal to destination
 * straightFirst = false: diagonal first, then straight along longer axis to destination
 */
function buildTwoSegmentPath(
  x1: number, y1: number, x2: number, y2: number,
  r: number, straightFirst: boolean,
): PathResult {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const sX = Math.sign(dx);
  const sY = Math.sign(dy);
  const horizontal = absX >= absY;
  const diag = horizontal ? absY : absX;
  const straightLen = (horizontal ? absX : absY) - diag;

  // Corner point where the straight and diagonal segments meet
  let cx: number, cy: number;
  if (straightFirst) {
    cx = horizontal ? x1 + straightLen * sX : x1;
    cy = horizontal ? y1 : y1 + straightLen * sY;
  } else {
    cx = horizontal ? x1 + diag * sX : x2;
    cy = horizontal ? y2 : y1 + diag * sY;
  }

  const segments: Segment[] = [[x1, y1, cx, cy], [cx, cy, x2, y2]];

  const er = Math.min(r, straightLen, diag);
  if (er < 2) {
    return { d: `M${x1},${y1} L${cx},${cy} L${x2},${y2}`, segments };
  }

  // Compute rounded-corner control points on either side of (cx, cy).
  // The straight side retracts along one axis; the diagonal side retracts at 45°.
  let preX: number, preY: number, postX: number, postY: number;
  if (straightFirst) {
    // Straight segment comes first: retract along the straight axis
    preX = horizontal ? cx - er * sX : cx;
    preY = horizontal ? cy : cy - er * sY;
    // Advance into the diagonal
    postX = cx + er * COS45 * sX;
    postY = cy + er * COS45 * sY;
  } else {
    // Diagonal segment comes first: retract along the diagonal
    preX = cx - er * COS45 * sX;
    preY = cy - er * COS45 * sY;
    // Advance into the straight axis
    postX = horizontal ? cx + er * sX : cx;
    postY = horizontal ? cy : cy + er * sY;
  }

  return {
    d: `M${x1},${y1} L${preX},${preY} Q${cx},${cy} ${postX},${postY} L${x2},${y2}`,
    segments,
  };
}

/** Straight line when unambiguous, chevron bypass when an intermediate station sits between endpoints. */
function buildCollinearPath(
  x1: number, y1: number, x2: number, y2: number,
  allStations: Point[],
): string {
  const dx = x2 - x1;
  const isVertical = Math.abs(dx) < 10;

  // Check for an intermediate station sitting between the two endpoints along the shared axis
  const hasIntermediate = allStations.some(s => {
    if (isVertical) {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      return Math.abs(s.x - x1) < 10 && s.y > minY + 10 && s.y < maxY - 10;
    }
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    return Math.abs(s.y - y1) < 10 && s.x > minX + 10 && s.x < maxX - 10;
  });

  if (!hasIntermediate) return `M${x1},${y1} L${x2},${y2}`;

  // Chevron: diagonal out to offset apex, rounded corner, diagonal back
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const apexX = isVertical ? mx + COLLINEAR_OFFSET : mx;
  const apexY = isVertical ? my : my + COLLINEAR_OFFSET;

  const armLen = Math.hypot(apexX - x1, apexY - y1);
  const er = Math.min(CORNER_RADIUS, armLen / 3);

  const nsX = (x1 - apexX) / armLen;
  const nsY = (y1 - apexY) / armLen;
  const endLen = Math.hypot(x2 - apexX, y2 - apexY);
  const neX = (x2 - apexX) / endLen;
  const neY = (y2 - apexY) / endLen;

  const preX = apexX + er * nsX;
  const preY = apexY + er * nsY;
  const postX = apexX + er * neX;
  const postY = apexY + er * neY;

  return `M${x1},${y1} L${preX},${preY} Q${apexX},${apexY} ${postX},${postY} L${x2},${y2}`;
}

export function createMetroPath(
  x1: number, y1: number, x2: number, y2: number,
  allStations: Point[] = [],
): string {
  const absX = Math.abs(x2 - x1);
  const absY = Math.abs(y2 - y1);

  // Aligned: straight line or chevron bypass
  if (absX < 10 || absY < 10) {
    return buildCollinearPath(x1, y1, x2, y2, allStations);
  }

  // Near-diagonal: straight diagonal line
  if (Math.abs(absX - absY) < 10) {
    return `M${x1},${y1} L${x2},${y2}`;
  }

  // Non-aligned: try both orientations, pick collision-free one
  const others = allStations.filter(
    s => !(Math.abs(s.x - x1) < 5 && Math.abs(s.y - y1) < 5) &&
         !(Math.abs(s.x - x2) < 5 && Math.abs(s.y - y2) < 5),
  );

  const straightFirst = buildTwoSegmentPath(x1, y1, x2, y2, CORNER_RADIUS, true);
  if (!pathCollides(straightFirst.segments, others, STATION_CLEARANCE)) {
    return straightFirst.d;
  }

  const diagFirst = buildTwoSegmentPath(x1, y1, x2, y2, CORNER_RADIUS, false);
  if (!pathCollides(diagFirst.segments, others, STATION_CLEARANCE)) {
    return diagFirst.d;
  }

  return straightFirst.d;
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
