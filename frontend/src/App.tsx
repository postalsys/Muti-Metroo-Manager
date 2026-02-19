import { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
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
import ActionsMenu from './components/ActionsMenu';
import RouteTable from './components/RouteTable';
import ForwardRouteTable from './components/ForwardRouteTable';
import Footer from './components/Footer';
import AgentPanel from './components/AgentPanel/AgentPanel';
import TestResultsModal from './components/TestResultsModal';

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
  const [testModal, setTestModal] = useState<{ type: 'success' | 'error'; data?: MeshTestResponse; error?: string } | null>(null);

  // Agent management state
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [sleepStatus, setSleepStatus] = useState<SleepStatusResponse | null>(null);
  const [sleepLoading, setSleepLoading] = useState(false);
  const [sleepError, setSleepError] = useState<string | null>(null);
  const capabilityCacheRef = useRef<Map<string, AgentCapabilities>>(new Map());
  const [capCacheVersion, bumpCapCache] = useReducer((n: number) => n + 1, 0);

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

  // Auto-dismiss sleep error after 5 seconds
  useEffect(() => {
    if (!sleepError) return;
    const id = setTimeout(() => setSleepError(null), 5000);
    return () => clearTimeout(id);
  }, [sleepError]);

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
    setSleepLoading(true);
    setSleepError(null);
    try {
      await sleepCluster();
      refreshSleepStatus();
    } catch (err) {
      setSleepError(err instanceof Error ? err.message : 'Failed to put mesh to sleep');
    } finally {
      setSleepLoading(false);
    }
  }, [refreshSleepStatus]);

  const handleWake = useCallback(async () => {
    setSleepLoading(true);
    setSleepError(null);
    try {
      await wakeCluster();
      refreshSleepStatus();
    } catch (err) {
      setSleepError(err instanceof Error ? err.message : 'Failed to wake mesh');
    } finally {
      setSleepLoading(false);
    }
  }, [refreshSleepStatus]);

  const handleRunTest = useCallback(async () => {
    setTestRunning(true);
    setTestModal(null);
    try {
      const results = await getMeshTest(true);
      setMeshTest(results);
      setTestModal({ type: 'success', data: results });
    } catch (err) {
      setTestModal({ type: 'error', error: err instanceof Error ? err.message : 'Mesh test failed' });
    } finally {
      setTestRunning(false);
    }
  }, []);

  const handleCapabilityUpdate = useCallback((agentId: string, cap: Partial<AgentCapabilities>) => {
    const existing = capabilityCacheRef.current.get(agentId) || { shell: null, fileTransfer: null };
    capabilityCacheRef.current.set(agentId, { ...existing, ...cap });
    bumpCapCache();
  }, []);

  const allForwardKeys = useMemo(() => {
    if (!topology) return [];
    const keys = new Set(topology.agents.flatMap(a => [
      ...(a.forward_listeners || []),
      ...(a.forward_endpoints || []),
    ]));
    return Array.from(keys).sort();
  }, [topology]);

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
  }, [selectedAgentId, capCacheVersion]);

  return (
    <>
      <Header agent={dashboard?.agent ?? null} />
      {sleepError && (
        <div className="sleep-error-banner">
          {sleepError}
        </div>
      )}
      {sleepStatus?.state === 'SLEEPING' && !sleepLoading && (
        <div className="sleep-banner">
          Mesh is sleeping — peer connections and tunnels are suspended
        </div>
      )}
      {testModal && (
        <TestResultsModal
          type={testModal.type}
          data={testModal.data}
          error={testModal.error}
          onClose={() => setTestModal(null)}
        />
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
          headerActions={
            <ActionsMenu
              sleepStatus={sleepStatus}
              sleepLoading={sleepLoading}
              testing={testRunning}
              onSleep={handleSleep}
              onWake={handleWake}
              onRunTest={handleRunTest}
            />
          }
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
          allForwardKeys={allForwardKeys}
          onCapabilityUpdate={handleCapabilityUpdate}
          onRoutesChanged={refresh}
          onClose={handleClosePanel}
        />
      )}
    </>
  );
}
