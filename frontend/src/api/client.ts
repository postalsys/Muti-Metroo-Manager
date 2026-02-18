import type {
  DashboardResponse,
  TopologyResponse,
  MeshTestResponse,
  SleepStatusResponse,
  RouteManageRequest,
  RouteManageResponse,
  ForwardManageRequest,
  ForwardManageResponse,
} from './types';

const BASE = '';

async function fetchJSON<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const opts: RequestInit = { method };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(`${BASE}${url}`, opts);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    // Try to extract message from JSON error responses
    let msg = text;
    try {
      const errObj = JSON.parse(text);
      if (errObj.message) msg = errObj.message;
    } catch {
      // Not JSON, use raw text
    }
    throw new Error(msg || `API error ${resp.status}: ${url}`);
  }
  return resp.json();
}

export function getDashboard(): Promise<DashboardResponse> {
  return fetchJSON('/api/proxy/api/dashboard');
}

export function getTopology(): Promise<TopologyResponse> {
  return fetchJSON('/api/proxy/api/topology');
}

export function getHealth(): Promise<unknown> {
  return fetchJSON('/api/proxy/healthz');
}

export function getMeshTest(forceRefresh = false): Promise<MeshTestResponse> {
  return fetchJSON('/api/proxy/api/mesh-test', forceRefresh ? 'POST' : 'GET');
}

export function triggerRouteAdvertise(): Promise<unknown> {
  return fetchJSON('/api/proxy/routes/advertise', 'POST');
}

// --- Agent management ---

export function manageAgentRoutes(agentId: string, req: RouteManageRequest): Promise<RouteManageResponse> {
  return fetchJSON(`/api/proxy/agents/${agentId}/routes/manage`, 'POST', req);
}

export function manageAgentForwards(agentId: string, req: ForwardManageRequest): Promise<ForwardManageResponse> {
  return fetchJSON(`/api/proxy/agents/${agentId}/forward/manage`, 'POST', req);
}

export async function downloadFile(agentId: string, path: string): Promise<Blob> {
  const resp = await fetch(`${BASE}/api/proxy/agents/${agentId}/file/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `Download failed: ${resp.status}`);
  }
  return resp.blob();
}

export async function uploadFile(
  agentId: string,
  file: File,
  remotePath: string,
): Promise<{ status: string; message?: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('path', remotePath);

  const resp = await fetch(`${BASE}/api/proxy/agents/${agentId}/file/upload`, {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `Upload failed: ${resp.status}`);
  }
  return resp.json();
}

export function getSleepStatus(): Promise<SleepStatusResponse> {
  return fetchJSON('/api/proxy/sleep/status');
}

export function sleepCluster(): Promise<unknown> {
  return fetchJSON('/api/proxy/sleep', 'POST');
}

export function wakeCluster(): Promise<unknown> {
  return fetchJSON('/api/proxy/wake', 'POST');
}

export function getShellWebSocketURL(agentId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/proxy/agents/${agentId}/shell`;
}
