import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  DashboardResponse, TopologyResponse, MeshTestResponse,
  SleepStatusResponse, AgentCapabilities, TopologyAgentInfo, MeshTestResult,
} from './api/types';
import {
  getDashboard, getTopology, getMeshTest,
  getSleepStatus, sleepCluster, wakeCluster,
} from './api/client';
import Header from './components/Header';
import StatsPanel from './components/StatsPanel';
import MetroMap from './components/MetroMap/MetroMap';
import RouteTable from './components/RouteTable';
import ForwardRouteTable from './components/ForwardRouteTable';
import Footer from './components/Footer';
import AgentPanel from './components/AgentPanel/AgentPanel';

const POLL_INTERVAL = 5000;
const MESH_TEST_INTERVAL = 60000;
const SLEEP_POLL_INTERVAL = 10000;

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [topology, setTopology] = useState<TopologyResponse | null>(null);
  const [meshTest, setMeshTest] = useState<MeshTestResponse | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testBanner, setTestBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Agent management state
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [sleepStatus, setSleepStatus] = useState<SleepStatusResponse | null>(null);
  const capabilityCacheRef = useRef<Map<string, AgentCapabilities>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const [dash, topo] = await Promise.all([getDashboard(), getTopology()]);
      setDashboard(dash);
      setTopology(topo);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to refresh dashboard:', err);
    }
  }, []);

  const runMeshTest = useCallback(async () => {
    try {
      const results = await getMeshTest(false);
      setMeshTest(results);
    } catch (err) {
      console.error('Failed to run mesh test:', err);
    }
  }, []);

  const refreshSleepStatus = useCallback(async () => {
    try {
      const status = await getSleepStatus();
      setSleepStatus(status);
    } catch {
      // Sleep endpoint may not exist - that's fine
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  // Mesh test polling
  useEffect(() => {
    runMeshTest();
    const id = setInterval(runMeshTest, MESH_TEST_INTERVAL);
    return () => clearInterval(id);
  }, [runMeshTest]);

  // Sleep status polling
  useEffect(() => {
    refreshSleepStatus();
    const id = setInterval(refreshSleepStatus, SLEEP_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refreshSleepStatus]);

  // Auto-dismiss test banner after 8s
  useEffect(() => {
    if (!testBanner) return;
    const id = setTimeout(() => setTestBanner(null), 8000);
    return () => clearTimeout(id);
  }, [testBanner]);

  const handleHighlight = useCallback((pathIds: string[]) => {
    setHighlightedPath(pathIds);
  }, []);

  const handleClearHighlight = useCallback(() => {
    setHighlightedPath([]);
  }, []);

  const handleStationClick = useCallback((agentId: string) => {
    setSelectedAgentId(prev => prev === agentId ? null : agentId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedAgentId(null);
  }, []);

  const handleSleep = useCallback(async () => {
    try {
      await sleepCluster();
      refreshSleepStatus();
    } catch (err) {
      console.error('Failed to sleep cluster:', err);
    }
  }, [refreshSleepStatus]);

  const handleWake = useCallback(async () => {
    try {
      await wakeCluster();
      refreshSleepStatus();
    } catch (err) {
      console.error('Failed to wake cluster:', err);
    }
  }, [refreshSleepStatus]);

  const handleRunTest = useCallback(async () => {
    setTestRunning(true);
    setTestBanner(null);
    try {
      const results = await getMeshTest(true);
      setMeshTest(results);
      const reachable = results.reachable_count ?? 0;
      const total = results.total_count ?? 0;
      const duration = results.duration_ms ?? 0;
      setTestBanner({ type: 'success', message: `${reachable}/${total} reachable · ${duration}ms` });
    } catch (err) {
      setTestBanner({ type: 'error', message: err instanceof Error ? err.message : 'Mesh test failed' });
    } finally {
      setTestRunning(false);
    }
  }, []);

  const handleCapabilityUpdate = useCallback((agentId: string, cap: Partial<AgentCapabilities>) => {
    const existing = capabilityCacheRef.current.get(agentId) || { shell: null, fileTransfer: null };
    capabilityCacheRef.current.set(agentId, { ...existing, ...cap });
    // Force re-render by updating selected agent
    setSelectedAgentId(prev => prev);
  }, []);

  // Resolve selected agent details
  const selectedAgent: TopologyAgentInfo | null = useMemo(() => {
    if (!selectedAgentId || !topology) return null;
    return topology.agents.find(a => a.short_id === selectedAgentId) || null;
  }, [selectedAgentId, topology]);

  const selectedMeshResult: MeshTestResult | undefined = useMemo(() => {
    if (!selectedAgentId || !meshTest?.results) return undefined;
    return meshTest.results.find(r => r.short_id === selectedAgentId);
  }, [selectedAgentId, meshTest]);

  const selectedCapabilities: AgentCapabilities = useMemo(() => {
    if (!selectedAgentId) return { shell: null, fileTransfer: null };
    return capabilityCacheRef.current.get(selectedAgentId) || { shell: null, fileTransfer: null };
  }, [selectedAgentId]);

  return (
    <>
      <Header
        agent={dashboard?.agent ?? null}
        sleepStatus={sleepStatus}
        testing={testRunning}
        onSleep={handleSleep}
        onWake={handleWake}
        onRunTest={handleRunTest}
      />
      {testBanner && (
        <div className={`test-banner test-banner-${testBanner.type}`}>
          <span>{testBanner.message}</span>
          <button className="test-banner-dismiss" onClick={() => setTestBanner(null)}>&times;</button>
        </div>
      )}
      <main className={selectedAgent ? 'panel-open' : ''}>
        <StatsPanel stats={dashboard?.stats ?? null} agents={topology?.agents ?? []} />
        <MetroMap
          agents={topology?.agents ?? []}
          connections={topology?.connections ?? []}
          meshTestResults={meshTest}
          highlightedPath={highlightedPath}
          selectedAgentId={selectedAgentId}
          onStationClick={handleStationClick}
        />
        <RouteTable
          routes={dashboard?.routes ?? null}
          onHighlight={handleHighlight}
          onClearHighlight={handleClearHighlight}
        />
        <ForwardRouteTable
          routes={dashboard?.forward_routes ?? null}
          onHighlight={handleHighlight}
          onClearHighlight={handleClearHighlight}
        />
      </main>
      <Footer lastUpdate={lastUpdate} />

      {selectedAgent && (
        <AgentPanel
          agent={selectedAgent}
          meshResult={selectedMeshResult}
          capabilities={selectedCapabilities}
          onCapabilityUpdate={handleCapabilityUpdate}
          onRoutesChanged={refresh}
          onClose={handleClosePanel}
        />
      )}
    </>
  );
}
