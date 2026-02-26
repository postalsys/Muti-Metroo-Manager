import { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import type {
  DashboardResponse, TopologyResponse, MeshTestResponse,
  SleepStatusResponse, AgentCapabilities,
} from './api/types';
import {
  getDashboard, getTopology, getMeshTest,
  getSleepStatus, sleepCluster, wakeCluster,
  setToken,
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
import TokenDialog from './components/TokenDialog';

const POLL_INTERVAL = 5000;
const MESH_TEST_INTERVAL = 60000;
const SLEEP_POLL_INTERVAL = 10000;
const DEFAULT_CAPABILITIES: AgentCapabilities = { shell: null, fileTransfer: null, icmp: null };

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [topology, setTopology] = useState<TopologyResponse | null>(null);
  const [meshTest, setMeshTest] = useState<MeshTestResponse | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testModal, setTestModal] = useState<{ type: 'success' | 'error'; data?: MeshTestResponse; error?: string } | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  // Agent management state
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [openedAgentIds, setOpenedAgentIds] = useState<Set<string>>(new Set());
  const [sleepStatus, setSleepStatus] = useState<SleepStatusResponse | null>(null);
  const [sleepLoading, setSleepLoading] = useState(false);
  const [sleepError, setSleepError] = useState<string | null>(null);
  const capabilityCacheRef = useRef<Map<string, AgentCapabilities>>(new Map());
  const [, bumpCapCache] = useReducer((n: number) => n + 1, 0);

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

  // Listen for auth-required events from API client
  useEffect(() => {
    const handler = () => setAuthRequired(true);
    window.addEventListener('auth-required', handler);
    return () => window.removeEventListener('auth-required', handler);
  }, []);

  const handleTokenSubmit = useCallback(async (token: string): Promise<void> => {
    let authFailed = false;
    try {
      const resp = await fetch('/api/proxy/api/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      authFailed = resp.status === 401;
    } catch {
      // Network error — can't validate, assume token is OK
    }
    if (authFailed) throw new Error('Invalid token');
    setToken(token);
    setAuthRequired(false);
    refresh();
  }, [refresh]);

  const handleHighlight = useCallback((pathIds: string[]) => {
    setHighlightedPath(pathIds);
  }, []);

  const handleClearHighlight = useCallback(() => {
    setHighlightedPath([]);
  }, []);

  const handleStationClick = useCallback((agentId: string) => {
    setSelectedAgentId(prev => prev === agentId ? null : agentId);
  }, []);

  const handleClosePanel = useCallback((agentId: string) => {
    setOpenedAgentIds(prev => {
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
    setSelectedAgentId(prev => prev === agentId ? null : prev);
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
    const existing = capabilityCacheRef.current.get(agentId) || DEFAULT_CAPABILITIES;
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

  // Add selected agent to opened set
  useEffect(() => {
    if (selectedAgentId) {
      setOpenedAgentIds(prev => {
        if (prev.has(selectedAgentId)) return prev;
        const next = new Set(prev);
        next.add(selectedAgentId);
        return next;
      });
    }
  }, [selectedAgentId]);

  // Remove agents that disappeared from topology (went offline)
  useEffect(() => {
    if (!topology) return;
    const liveIds = new Set(topology.agents.map(a => a.short_id));
    setOpenedAgentIds(prev => {
      const next = new Set([...prev].filter(id => liveIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setSelectedAgentId(prev => (prev && !liveIds.has(prev)) ? null : prev);
  }, [topology]);

  // Resolve opened agents from topology
  const openedAgents = useMemo(() => {
    if (!topology) return [];
    return topology.agents.filter(a => openedAgentIds.has(a.short_id));
  }, [topology, openedAgentIds]);

  return (
    <>
      {authRequired && <TokenDialog onSubmit={handleTokenSubmit} />}
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
      <main className={selectedAgentId ? 'panel-open' : ''}>
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

      {openedAgents.map(agent => (
        <AgentPanel
          key={agent.short_id}
          agent={agent}
          isActive={selectedAgentId === agent.short_id}
          meshResult={meshTest?.results?.find(r => r.short_id === agent.short_id)}
          capabilities={capabilityCacheRef.current.get(agent.short_id) || DEFAULT_CAPABILITIES}
          allForwardKeys={allForwardKeys}
          onCapabilityUpdate={handleCapabilityUpdate}
          onRoutesChanged={refresh}
          onClose={() => handleClosePanel(agent.short_id)}
          animate={openedAgents.length <= 1}
        />
      ))}
    </>
  );
}
