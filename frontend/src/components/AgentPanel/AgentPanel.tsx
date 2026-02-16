import { useState, useEffect, useCallback } from 'react';
import type { TopologyAgentInfo, MeshTestResult, AgentCapabilities } from '../../api/types';
import InfoTab from './InfoTab';
import RoutesTab from './RoutesTab';
import ShellTab from './ShellTab';
import FilesTab from './FilesTab';

type TabId = 'info' | 'routes' | 'shell' | 'files';

interface AgentPanelProps {
  agent: TopologyAgentInfo;
  meshResult: MeshTestResult | undefined;
  capabilities: AgentCapabilities;
  onCapabilityUpdate: (agentId: string, cap: Partial<AgentCapabilities>) => void;
  onRoutesChanged: () => void;
  onClose: () => void;
}

export default function AgentPanel({ agent, meshResult, capabilities, onCapabilityUpdate, onRoutesChanged, onClose }: AgentPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('info');

  // Escape key closes panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCapUpdate = useCallback(
    (cap: Partial<AgentCapabilities>) => {
      onCapabilityUpdate(agent.short_id, cap);
    },
    [agent.short_id, onCapabilityUpdate],
  );

  const tabs: { id: TabId; label: string; disabled: boolean }[] = [
    { id: 'info', label: 'Info', disabled: false },
    { id: 'routes', label: 'Routes', disabled: false },
    { id: 'shell', label: 'Shell', disabled: capabilities.shell === false },
    { id: 'files', label: 'Files', disabled: capabilities.fileTransfer === false },
  ];

  return (
    <aside className="agent-panel">
      <div className="agent-panel-header">
        <div className="agent-panel-title">{agent.display_name || agent.short_id}</div>
        <button className="agent-panel-close" onClick={onClose}>&times;</button>
      </div>
      <div className="agent-panel-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`agent-panel-tab${activeTab === tab.id ? ' active' : ''}${tab.disabled ? ' tab-disabled' : ''}`}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="agent-panel-content">
        {activeTab === 'info' && <InfoTab agent={agent} meshResult={meshResult} />}
        {activeTab === 'routes' && <RoutesTab agent={agent} onRoutesChanged={onRoutesChanged} />}
        {activeTab === 'shell' && (
          <ShellTab
            agent={agent}
            disabled={capabilities.shell === false}
            onDisabled={() => handleCapUpdate({ shell: false })}
          />
        )}
        {activeTab === 'files' && (
          <FilesTab
            agent={agent}
            disabled={capabilities.fileTransfer === false}
            onDisabled={() => handleCapUpdate({ fileTransfer: false })}
          />
        )}
      </div>
    </aside>
  );
}
