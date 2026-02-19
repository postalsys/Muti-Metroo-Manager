import type { TopologyAgentInfo } from '../api/types';

interface HeaderProps {
  agent: TopologyAgentInfo | null;
}

export default function Header({ agent }: HeaderProps) {
  return (
    <header>
      <div className="header-content">
        <div className="header-brand">
          <img src="/logo.png" alt="Muti Metroo" className="header-logo" />
          <h1>Muti Metroo</h1>
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
