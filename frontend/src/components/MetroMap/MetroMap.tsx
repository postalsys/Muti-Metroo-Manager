import { useState, useCallback, useRef, useMemo } from 'react';
import type { TopologyAgentInfo, TopologyConnection, MeshTestResponse, MeshTestResult } from '../../api/types';
import { calculateTreeLayout, calculateViewBox, hashTopology } from './layout';
import type { PositionedAgent } from './layout';
import Station from './Station';
import Connection from './Connection';
import StationTooltip from './StationTooltip';
import ConnectionTooltip from './ConnectionTooltip';

interface MetroMapProps {
  agents: TopologyAgentInfo[];
  connections: TopologyConnection[];
  meshTestResults: MeshTestResponse | null;
  highlightedPath: string[];
  selectedAgentId: string | null;
  onStationClick: (agentId: string) => void;
}

export default function MetroMap({ agents, connections, meshTestResults, highlightedPath, selectedAgentId, onStationClick }: MetroMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Station tooltip state
  const [hoveredStation, setHoveredStation] = useState<PositionedAgent | null>(null);
  const [stationElement, setStationElement] = useState<SVGGElement | null>(null);
  const [tooltipHovered, setTooltipHovered] = useState(false);
  const tooltipHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Connection tooltip state
  const [connTooltip, setConnTooltip] = useState<{
    from: PositionedAgent;
    to: PositionedAgent;
    conn: TopologyConnection;
  } | null>(null);
  const [connTooltipPos, setConnTooltipPos] = useState({ x: 0, y: 0 });

  // Layout calculation (memoized by topology hash)
  const topoHash = useMemo(() => hashTopology(agents, connections), [agents, connections]);
  const positionedAgents = useMemo(
    () => calculateTreeLayout(agents, connections),
    [topoHash]
  );
  const viewBox = useMemo(() => calculateViewBox(positionedAgents), [positionedAgents]);

  // Agent lookup map
  const agentMap = useMemo(() => {
    const m = new Map<string, PositionedAgent>();
    for (const a of positionedAgents) m.set(a.short_id, a);
    return m;
  }, [positionedAgents]);

  // Mesh test results lookup
  const meshResultMap = useMemo(() => {
    const m = new Map<string, MeshTestResult>();
    if (meshTestResults?.results) {
      for (const r of meshTestResults.results) {
        m.set(r.short_id, r);
      }
    }
    return m;
  }, [meshTestResults]);

  // Highlight state
  const pathSet = useMemo(() => new Set(highlightedPath), [highlightedPath]);
  const hasHighlight = highlightedPath.length > 0;

  function getStationHighlight(agentId: string): 'none' | 'highlighted' | 'dimmed' {
    if (!hasHighlight) return 'none';
    return pathSet.has(agentId) ? 'highlighted' : 'dimmed';
  }

  function getConnectionHighlight(fromId: string, toId: string): 'none' | 'highlighted' | 'dimmed' {
    if (!hasHighlight) return 'none';
    for (let i = 0; i < highlightedPath.length - 1; i++) {
      if (
        (highlightedPath[i] === fromId && highlightedPath[i + 1] === toId) ||
        (highlightedPath[i] === toId && highlightedPath[i + 1] === fromId)
      ) {
        return 'highlighted';
      }
    }
    return 'dimmed';
  }

  // Station hover handlers
  const handleStationHover = useCallback((agent: PositionedAgent, el: SVGGElement) => {
    if (tooltipHideTimeoutRef.current) {
      clearTimeout(tooltipHideTimeoutRef.current);
      tooltipHideTimeoutRef.current = null;
    }
    setHoveredStation(agent);
    setStationElement(el);
  }, []);

  const handleStationLeave = useCallback(() => {
    tooltipHideTimeoutRef.current = setTimeout(() => {
      if (!tooltipHovered) {
        setHoveredStation(null);
        setStationElement(null);
      }
    }, 150);
  }, [tooltipHovered]);

  const handleTooltipMouseEnter = useCallback(() => {
    setTooltipHovered(true);
    if (tooltipHideTimeoutRef.current) {
      clearTimeout(tooltipHideTimeoutRef.current);
      tooltipHideTimeoutRef.current = null;
    }
  }, []);

  const handleTooltipMouseLeave = useCallback(() => {
    setTooltipHovered(false);
    setHoveredStation(null);
    setStationElement(null);
  }, []);

  // Connection hover handlers
  const handleConnHover = useCallback(
    (e: React.MouseEvent, from: PositionedAgent, to: PositionedAgent, conn: TopologyConnection) => {
      setConnTooltip({ from, to, conn });
      positionConnTooltip(e);
    },
    [],
  );

  const handleConnMove = useCallback((e: React.MouseEvent) => {
    positionConnTooltip(e);
  }, []);

  const handleConnLeave = useCallback(() => {
    setConnTooltip(null);
  }, []);

  function positionConnTooltip(e: React.MouseEvent) {
    let x = e.clientX + 15;
    let y = e.clientY + 15;
    setConnTooltipPos({ x, y });
  }

  // Sort agents by ID for deterministic render order
  const sortedAgents = useMemo(
    () => [...positionedAgents].sort((a, b) => a.short_id.localeCompare(b.short_id)),
    [positionedAgents],
  );

  return (
    <section className="metro-section">
      <h2>Network Topology</h2>
      <div className="map-container">
        <svg
          ref={svgRef}
          className="metro-svg"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
          <g>
            {connections.map((conn, i) => {
              const from = agentMap.get(conn.from_agent);
              const to = agentMap.get(conn.to_agent);
              if (!from || !to) return null;
              return (
                <Connection
                  key={`${conn.from_agent}-${conn.to_agent}`}
                  from={from}
                  to={to}
                  conn={conn}
                  highlightState={getConnectionHighlight(conn.from_agent, conn.to_agent)}
                  onHover={handleConnHover}
                  onMove={handleConnMove}
                  onLeave={handleConnLeave}
                />
              );
            })}
          </g>
          <g>
            {positionedAgents.length === 0 ? (
              <text className="empty-state" x="500" y="300">
                No topology data available
              </text>
            ) : (
              sortedAgents.map(agent => (
                <Station
                  key={agent.short_id}
                  agent={agent}
                  meshResult={meshResultMap.get(agent.short_id)}
                  highlightState={getStationHighlight(agent.short_id)}
                  selected={agent.short_id === selectedAgentId}
                  onHover={handleStationHover}
                  onLeave={handleStationLeave}
                  onClick={onStationClick}
                />
              ))
            )}
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div className="map-legend">
        <div className="legend-group">
          <div className="legend-title">Connection</div>
          <div className="legend-item"><span className="legend-color local" /><span>Local</span></div>
          <div className="legend-item"><span className="legend-color connected" /><span>Connected</span></div>
          <div className="legend-item"><span className="legend-color remote" /><span>Remote</span></div>
        </div>
        <div className="legend-group">
          <div className="legend-title">Role</div>
          <div className="legend-item"><span className="legend-ring ingress" /><span>Ingress</span></div>
          <div className="legend-item"><span className="legend-ring exit" /><span>Exit</span></div>
          <div className="legend-item"><span className="legend-ring transit" /><span>Transit</span></div>
          <div className="legend-item"><span className="legend-ring forward_ingress" /><span>Port Forward Entry</span></div>
          <div className="legend-item"><span className="legend-ring forward_exit" /><span>Port Forward Exit</span></div>
        </div>
      </div>

      {/* Tooltips rendered as portals outside SVG */}
      {hoveredStation && (
        <StationTooltip
          agent={hoveredStation}
          meshResult={meshResultMap.get(hoveredStation.short_id)}
          stationElement={stationElement}
          svgElement={svgRef.current}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        />
      )}

      {connTooltip && (
        <ConnectionTooltip
          from={connTooltip.from}
          to={connTooltip.to}
          conn={connTooltip.conn}
          position={connTooltipPos}
        />
      )}
    </section>
  );
}
