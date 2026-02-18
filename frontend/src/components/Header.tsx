import type { TopologyAgentInfo, SleepStatusResponse } from '../api/types';

interface HeaderProps {
  agent: TopologyAgentInfo | null;
  sleepStatus: SleepStatusResponse | null;
  testing: boolean;
  onSleep: () => void;
  onWake: () => void;
  onRunTest: () => void;
}

export default function Header({ agent, sleepStatus, testing, onSleep, onWake, onRunTest }: HeaderProps) {
  return (
    <header>
      <div className="header-content">
        <div className="header-brand">
          <img src="/logo.png" alt="Muti Metroo" className="header-logo" />
          <h1>Muti Metroo</h1>
        </div>
        <div className="header-controls">
          <button
            className="header-btn test-btn"
            onClick={onRunTest}
            disabled={testing}
          >
            {testing ? 'Testing...' : 'Run Test'}
          </button>
          {sleepStatus?.enabled && (
            <>
              {sleepStatus.state === 'AWAKE' && (
                <button className="header-btn sleep-btn" onClick={onSleep}>
                  Sleep
                </button>
              )}
              {sleepStatus.state === 'SLEEPING' && (
                <button className="header-btn wake-btn" onClick={onWake}>
                  Wake
                </button>
              )}
              {sleepStatus.state === 'POLLING' && (
                <button className="header-btn polling-btn" disabled>
                  Polling...
                </button>
              )}
            </>
          )}
        </div>
        <div className="agent-info">
          <span className="agent-name">
            {agent ? (agent.display_name || agent.short_id) : 'Loading...'}
          </span>
          {agent && <span className="agent-id">{agent.short_id}</span>}
        </div>
      </div>
    </header>
  );
}
