import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { TopologyAgentInfo, ShellMeta } from '../../api/types';
import {
  MSG_META, MSG_STDIN, MSG_STDOUT, MSG_STDERR,
  MSG_RESIZE, MSG_ACK, MSG_EXIT, MSG_ERROR,
  ERR_SHELL_DISABLED,
} from '../../api/types';
import { getShellWebSocketURL } from '../../api/client';

interface ShellTabProps {
  agent: TopologyAgentInfo;
  disabled: boolean;
  onDisabled: () => void;
}

function encodeShellFrame(msgType: number, payload: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(1 + payload.byteLength);
  const view = new Uint8Array(buf);
  view[0] = msgType;
  view.set(payload, 1);
  return buf;
}

function encodeMetaFrame(meta: ShellMeta): ArrayBuffer {
  const json = JSON.stringify(meta);
  const encoder = new TextEncoder();
  return encodeShellFrame(MSG_META, encoder.encode(json));
}

// Matches xterm.js auto-responses to terminal queries (CPR, DA1, DA2, DSR).
// Intercepted in onData to prevent echo loops with remote PTYs.
const TERM_AUTO_RESPONSE = /^\x1b\[[\?>]?[\d;]*[Rcn]$/;

function encodeResizeFrame(rows: number, cols: number): ArrayBuffer {
  // Backend expects 4 raw bytes: rows (uint16 BE) + cols (uint16 BE)
  const payload = new Uint8Array(4);
  const dv = new DataView(payload.buffer);
  dv.setUint16(0, rows, false);
  dv.setUint16(2, cols, false);
  return encodeShellFrame(MSG_RESIZE, payload);
}

export default function ShellTab({ agent, disabled, onDisabled }: ShellTabProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'ended' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (disabled || !termRef.current) return;

    connectedRef.current = false;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Courier New', monospace",
      theme: {
        background: '#1a1a1a',
        foreground: '#f5ebe0',
        cursor: '#daa054',
        selectionBackground: 'rgba(218, 160, 84, 0.3)',
        black: '#1a1a1a',
        red: '#cf6679',
        green: '#6db36d',
        yellow: '#daa054',
        blue: '#5b9bd5',
        magenta: '#9b59b6',
        cyan: '#5bc0de',
        white: '#f5ebe0',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(termRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const wsURL = getShellWebSocketURL(agent.id);
    const ws = new WebSocket(wsURL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    const sendStdin = (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        const encoder = new TextEncoder();
        ws.send(encodeShellFrame(MSG_STDIN, encoder.encode(data)));
      }
    };

    // Suppress terminal query auto-responses at the parser level to prevent
    // echo loops with remote BusyBox PTYs that have echo enabled.
    // DSR (ESC[6n]) is proxied via sendStdin for screen dimension detection.
    // DA1/DA2 are fully suppressed (unused by BusyBox).
    terminal.parser.registerCsiHandler({ final: 'n' }, (params) => {
      if (params[0] === 6 && connectedRef.current) {
        const row = terminal.buffer.active.cursorY + 1;
        const col = terminal.buffer.active.cursorX + 1;
        sendStdin(`\x1b[${row};${col}R`);
      }
      return true;
    });
    terminal.parser.registerCsiHandler({ final: 'c' }, () => true);
    terminal.parser.registerCsiHandler({ prefix: '>', final: 'c' }, () => true);
    // Suppress CPR echo -- discard ESC[row;colR echoed back by the PTY.
    terminal.parser.registerCsiHandler({ final: 'R' }, () => true);

    ws.onopen = () => {
      const dims = fitAddon.proposeDimensions();
      const meta: ShellMeta = {
        command: 'sh',
        tty: {
          rows: dims?.rows ?? 24,
          cols: dims?.cols ?? 80,
          term: 'xterm-256color',
        },
      };
      ws.send(encodeMetaFrame(meta));
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        try {
          const errObj = JSON.parse(event.data);
          const msg = errObj.message || event.data;
          if (msg.includes('SHELL_DISABLED') || errObj.code === ERR_SHELL_DISABLED) {
            onDisabled();
            setStatus('error');
            setErrorMsg('Shell is not enabled on this agent');
            return;
          }
          setStatus('error');
          setErrorMsg(msg);
        } catch {
          setStatus('error');
          setErrorMsg(event.data);
        }
        return;
      }

      const data = new Uint8Array(event.data as ArrayBuffer);
      if (data.length < 1) return;

      const msgType = data[0];
      const payload = data.slice(1);

      switch (msgType) {
        case MSG_ACK:
          connectedRef.current = true;
          setStatus('connected');
          terminal.focus();
          break;
        case MSG_STDOUT:
        case MSG_STDERR:
          terminal.write(payload);
          break;
        case MSG_EXIT:
          setStatus('ended');
          terminal.write('\r\n\x1b[33m[Session ended]\x1b[0m\r\n');
          break;
        case MSG_ERROR: {
          const decoder = new TextDecoder();
          const errText = decoder.decode(payload);
          try {
            const errObj = JSON.parse(errText);
            if (errObj.code === ERR_SHELL_DISABLED || (errObj.message && errObj.message.includes('SHELL_DISABLED'))) {
              onDisabled();
              setStatus('error');
              setErrorMsg('Shell is not enabled on this agent');
              return;
            }
          } catch {
            // Not JSON
          }
          setStatus('error');
          setErrorMsg(errText || 'Shell error');
          break;
        }
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setErrorMsg('Shell is not available on this agent');
    };

    ws.onclose = () => {
      if (!connectedRef.current) {
        setStatus('error');
        setErrorMsg('Shell is not available on this agent');
      } else {
        setStatus('ended');
        terminal.write('\r\n\x1b[33m[Connection lost]\x1b[0m\r\n');
      }
    };

    // Forward user input to the remote shell, filtering out xterm.js
    // auto-responses to terminal queries to prevent echo-back garbage.
    const dataDisposable = terminal.onData((data: string) => {
      if (connectedRef.current && !TERM_AUTO_RESPONSE.test(data)) {
        sendStdin(data);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && ws.readyState === WebSocket.OPEN && connectedRef.current) {
        ws.send(encodeResizeFrame(dims.rows, dims.cols));
      }
    });
    if (termRef.current) {
      resizeObserver.observe(termRef.current);
    }

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      ws.close();
      terminal.dispose();
      terminalRef.current = null;
      wsRef.current = null;
      fitAddonRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onDisabled is intentionally
  // excluded: it's an inline arrow in the parent and would cause the effect to re-run
  // on every poll cycle, tearing down and recreating the WebSocket every 5s.
  }, [agent.id, disabled]);

  if (disabled) {
    return (
      <div className="tab-disabled-msg">
        Shell is not enabled on this agent
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="tab-disabled-msg">
        {errorMsg}
      </div>
    );
  }

  return (
    <div className="shell-tab">
      <div className="shell-status">
        {status === 'connecting' && <span className="shell-status-connecting">Connecting...</span>}
        {status === 'connected' && <span className="shell-status-connected">Connected</span>}
        {status === 'ended' && <span className="shell-status-ended">Session ended</span>}
      </div>
      <div className="shell-terminal" ref={termRef} />
    </div>
  );
}
