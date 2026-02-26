import { useState, useEffect, useRef, useCallback } from 'react';
import type { TopologyAgentInfo } from '../../api/types';
import { getPingWebSocketURL } from '../../api/client';

interface PingResult {
  sequence: number;
  sendTime: number;
  rttMs: number | null;
  error?: string;
}

interface PingTabProps {
  agent: TopologyAgentInfo;
  onDisabled: () => void;
}

const MAX_RESULTS = 100;
const PING_INTERVAL = 1000;
const PING_TIMEOUT = 6000;
const COUNT_OPTIONS = [10, 25, 50, 0] as const; // 0 = unlimited

type PingStatus = 'idle' | 'connecting' | 'running' | 'stopped' | 'error';

export default function PingTab({ agent, onDisabled }: PingTabProps) {
  const [targetInput, setTargetInput] = useState('');
  const [pingCount, setPingCount] = useState(10);
  const [infoOpen, setInfoOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [status, setStatus] = useState<PingStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [sourceIp, setSourceIp] = useState<string | null>(null);
  const [destIp, setDestIp] = useState<string | null>(null);
  const [results, setResults] = useState<PingResult[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef(0);
  const countRef = useRef(pingCount);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const stoppedRef = useRef(false);

  function clearSeqTimeout(seq: number): void {
    const tid = timeoutsRef.current.get(seq);
    if (tid != null) {
      clearTimeout(tid);
      timeoutsRef.current.delete(seq);
    }
  }

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    for (const t of timeoutsRef.current.values()) clearTimeout(t);
    timeoutsRef.current.clear();
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!activeTarget) return;

    stoppedRef.current = false;
    seqRef.current = 0;
    setResults([]);
    setErrorMsg('');
    setSourceIp(null);
    setDestIp(activeTarget);
    setStatus('connecting');

    const ws = new WebSocket(getPingWebSocketURL(agent.id), 'muti-icmp');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'init', dest_ip: activeTarget }));
    };

    ws.onmessage = (ev) => {
      let msg: { type: string; success?: boolean; error?: string; sequence?: number; src_ip?: string };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (msg.type === 'init_ack') {
        if (msg.success) {
          setStatus('running');
          intervalRef.current = setInterval(() => {
            seqRef.current += 1;
            const seq = seqRef.current;
            const now = Date.now();
            ws.send(JSON.stringify({ type: 'echo', sequence: seq, payload: '' }));
            setResults(prev => {
              const next = [{ sequence: seq, sendTime: now, rttMs: null }, ...prev];
              return next.length > MAX_RESULTS ? next.slice(0, MAX_RESULTS) : next;
            });
            const tid = setTimeout(() => {
              timeoutsRef.current.delete(seq);
              setResults(prev => prev.map(r =>
                r.sequence === seq && r.rttMs === null && !r.error
                  ? { ...r, error: 'timeout' }
                  : r
              ));
            }, PING_TIMEOUT);
            timeoutsRef.current.set(seq, tid);
            // Auto-stop after reaching count (0 = unlimited)
            if (countRef.current > 0 && seq >= countRef.current) {
              clearInterval(intervalRef.current!);
              intervalRef.current = null;
              stoppedRef.current = true;
              setStatus('stopped');
              // Close WS after allowing time for last replies
              setTimeout(() => {
                if (wsRef.current) {
                  wsRef.current.close();
                  wsRef.current = null;
                }
                setActiveTarget(null);
              }, PING_TIMEOUT + 500);
            }
          }, PING_INTERVAL);
        } else {
          const err = msg.error || 'Init failed';
          if (err.toLowerCase().includes('disabled')) {
            onDisabled();
          }
          setErrorMsg(err);
          setStatus('error');
          ws.close();
        }
        return;
      }

      if (msg.type === 'reply' && msg.sequence != null) {
        const seq = msg.sequence;
        clearSeqTimeout(seq);
        const now = Date.now();
        if (msg.src_ip) setSourceIp(prev => prev ?? msg.src_ip!);
        setResults(prev => prev.map(r =>
          r.sequence === seq ? { ...r, rttMs: now - r.sendTime } : r
        ));
        return;
      }

      if (msg.type === 'error' && msg.sequence != null) {
        const seq = msg.sequence;
        clearSeqTimeout(seq);
        setResults(prev => prev.map(r =>
          r.sequence === seq ? { ...r, error: msg.error || 'error' } : r
        ));
      }
    };

    ws.onerror = () => {
      if (!stoppedRef.current) {
        setStatus('error');
        setErrorMsg('WebSocket error');
      }
    };

    ws.onclose = () => {
      if (!stoppedRef.current) {
        setStatus(prev => {
          if (prev === 'running' || prev === 'connecting') {
            setErrorMsg('Connection closed');
            return 'error';
          }
          return prev;
        });
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    return cleanup;
  }, [agent.id, activeTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = useCallback(() => {
    const target = targetInput.trim();
    if (!target) return;
    countRef.current = pingCount;
    setActiveTarget(target);
  }, [targetInput, pingCount]);

  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    setActiveTarget(null);
    cleanup();
    setStatus('stopped');
  }, [cleanup]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !activeTarget) handleStart();
  }, [activeTarget, handleStart]);

  const rtts = results.filter(r => r.rttMs !== null).map(r => r.rttMs!);
  const sent = results.filter(r => r.rttMs !== null || r.error).length;
  const received = rtts.length;
  const lossPercent = sent > 0 ? ((sent - received) / sent * 100) : 0;
  const minRtt = rtts.length > 0 ? Math.min(...rtts) : 0;
  const maxRtt = rtts.length > 0 ? Math.max(...rtts) : 0;
  const avgRtt = rtts.length > 0 ? rtts.reduce((a, b) => a + b, 0) / rtts.length : 0;

  const isRunning = activeTarget !== null;
  const hasRtts = rtts.length > 0;

  return (
    <div className="ping-tab">
      <div className="ping-form">
        <input
          className="panel-input ping-input"
          type="text"
          placeholder="IP address (e.g. 8.8.8.8)"
          value={targetInput}
          onChange={e => setTargetInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
        />
        <select
          className="panel-input ping-count-select"
          value={pingCount}
          onChange={e => setPingCount(Number(e.target.value))}
          disabled={isRunning}
        >
          {COUNT_OPTIONS.map(n => (
            <option key={n} value={n}>{n === 0 ? '\u221E' : n}</option>
          ))}
        </select>
        {isRunning ? (
          <button className="panel-btn panel-btn-danger ping-stop-btn" onClick={handleStop}>Stop</button>
        ) : (
          <button className="panel-btn" onClick={handleStart} disabled={!targetInput.trim()}>Start</button>
        )}
      </div>

      <div className="ping-info">
        <button className="ping-info-toggle" onClick={() => setInfoOpen(v => !v)}>
          <span className={`ping-info-arrow${infoOpen ? ' open' : ''}`}>&#9654;</span>
          Unprivileged ICMP
        </button>
        {infoOpen && (
          <div className="ping-info-body">
            The agent uses unprivileged ICMP sockets (no root required). The kernel
            handles echo requests via UDP-based datagram sockets, which means:
            <ul>
              <li>Only ICMP Echo (ping) is supported — no traceroute or other ICMP types</li>
              <li>The kernel assigns ICMP identifiers, not the agent</li>
              <li>Source IP in replies reflects the remote host, not the local outbound interface</li>
              <li>Requires <code>net.ipv4.ping_group_range</code> sysctl to include the agent's GID on Linux</li>
            </ul>
            RTT is measured end-to-end from the manager through the mesh to the exit
            node and back — it includes mesh latency, not just network latency to the target.
          </div>
        )}
      </div>

      {status !== 'idle' && (
        <div className="ping-status-bar">
          <span className={`ping-status-dot ping-status-dot-${status}`} />
          <span className="ping-status-text">
            {status === 'connecting' && 'Connecting...'}
            {status === 'running' && activeTarget}
            {status === 'stopped' && 'Stopped'}
            {status === 'error' && (errorMsg || 'Error')}
          </span>
        </div>
      )}

      {sent > 0 && (
        <div className="ping-stats">
          <div className="ping-stat">
            <span className="ping-stat-label">Min</span>
            <span className="ping-stat-value">{hasRtts ? `${minRtt.toFixed(1)}ms` : '\u2014'}</span>
          </div>
          <div className="ping-stat">
            <span className="ping-stat-label">Avg</span>
            <span className="ping-stat-value">{hasRtts ? `${avgRtt.toFixed(1)}ms` : '\u2014'}</span>
          </div>
          <div className="ping-stat">
            <span className="ping-stat-label">Max</span>
            <span className="ping-stat-value">{hasRtts ? `${maxRtt.toFixed(1)}ms` : '\u2014'}</span>
          </div>
          <div className="ping-stat">
            <span className="ping-stat-label">Sent</span>
            <span className="ping-stat-value">{sent}</span>
          </div>
          <div className="ping-stat">
            <span className="ping-stat-label">Recv</span>
            <span className="ping-stat-value">{received}</span>
          </div>
          <div className="ping-stat">
            <span className="ping-stat-label">Loss</span>
            <span className={`ping-stat-value${lossPercent > 0 ? ' ping-stat-loss' : ''}`}>{lossPercent.toFixed(0)}%</span>
          </div>
          {destIp && (
            <div className="ping-stat-ips">
              <div className="ping-stat-ip">
                <span className="ping-stat-label">Source</span>
                <span className="ping-stat-value">{sourceIp || '\u2014'}</span>
              </div>
              <div className="ping-stat-ip">
                <span className="ping-stat-label">Dest</span>
                <span className="ping-stat-value">{destIp}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="ping-results">
          <div className="ping-results-header">
            <span className="ping-col-seq">Seq</span>
            <span className="ping-col-rtt">RTT</span>
            <span className="ping-col-result">Result</span>
          </div>
          <div className="ping-results-list">
            {results.map(r => {
              const isOk = r.rttMs !== null && !r.error;
              const isTimeout = r.error === 'timeout';
              const isError = r.error && r.error !== 'timeout';
              const isPending = r.rttMs === null && !r.error;
              return (
                <div key={r.sequence} className={`ping-row${isOk ? ' ping-row-ok' : ''}${isTimeout || isError ? ' ping-row-err' : ''}${isPending ? ' ping-row-pending' : ''}`}>
                  <span className="ping-col-seq">{r.sequence}</span>
                  <span className="ping-col-rtt">{r.rttMs != null ? `${r.rttMs.toFixed(1)}ms` : '\u2014'}</span>
                  <span className="ping-col-result">
                    {isOk && <><span className="ping-dot ping-dot-ok" /> reply</>}
                    {isTimeout && <><span className="ping-dot ping-dot-err" /> timeout</>}
                    {isError && <><span className="ping-dot ping-dot-err" /> {r.error}</>}
                    {isPending && <span className="ping-pending-text">...</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
