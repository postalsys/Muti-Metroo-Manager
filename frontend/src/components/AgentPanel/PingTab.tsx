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

type PingStatus = 'idle' | 'connecting' | 'running' | 'stopped' | 'error';

export default function PingTab({ agent, onDisabled }: PingTabProps) {
  const [targetInput, setTargetInput] = useState('');
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [status, setStatus] = useState<PingStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [results, setResults] = useState<PingResult[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef(0);
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
    setStatus('connecting');

    const ws = new WebSocket(getPingWebSocketURL(agent.id), 'muti-icmp');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'init', dest_ip: activeTarget }));
    };

    ws.onmessage = (ev) => {
      let msg: { type: string; success?: boolean; error?: string; sequence?: number };
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
    setActiveTarget(target);
  }, [targetInput]);

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
        {isRunning ? (
          <button className="panel-btn panel-btn-danger ping-stop-btn" onClick={handleStop}>Stop</button>
        ) : (
          <button className="panel-btn" onClick={handleStart} disabled={!targetInput.trim()}>Start</button>
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
