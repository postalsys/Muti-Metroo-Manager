import { useState, useEffect, useCallback } from 'react';
import type { TopologyAgentInfo, MeshTestResult, AgentCapabilities } from '../../api/types';
import InfoTab from './InfoTab';
import RoutesTab from './RoutesTab';
import ForwardsTab from './ForwardsTab';
import ShellTab from './ShellTab';
import FilesTab from './FilesTab';

type TabId = 'info' | 'routes' | 'forwards' | 'shell' | 'files';

interface AgentPanelProps {
  agent: TopologyAgentInfo;
  isActive: boolean;
  meshResult: MeshTestResult | undefined;
  capabilities: AgentCapabilities;
  allForwardKeys: string[];
  onCapabilityUpdate: (agentId: string, cap: Partial<AgentCapabilities>) => void;
  onRoutesChanged: () => void;
  onClose: () => void;
}

export default function AgentPanel({ agent, isActive, meshResult, capabilities, allForwardKeys, onCapabilityUpdate, onRoutesChanged, onClose }: AgentPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('info');

  // Escape key closes panel (only when active)
  useEffect(() => {
    if (!isActive) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onClose]);

  const handleCapUpdate = useCallback(
    (cap: Partial<AgentCapabilities>) => {
      onCapabilityUpdate(agent.short_id, cap);
    },
    [agent.short_id, onCapabilityUpdate],
  );

  const tabs: { id: TabId; label: string; disabled: boolean }[] = [
    { id: 'info', label: 'Info', disabled: false },
    { id: 'routes', label: 'Routes', disabled: false },
    { id: 'forwards', label: 'Forwards', disabled: false },
    { id: 'shell', label: 'Shell', disabled: capabilities.shell === false || agent.shell_enabled !== true },
    { id: 'files', label: 'Files', disabled: capabilities.fileTransfer === false || !agent.file_transfer_enabled },
  ];

  return (
    <aside className="agent-panel" style={isActive ? undefined : { display: 'none' }}>
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
        {activeTab === 'forwards' && <ForwardsTab agent={agent} allForwardKeys={allForwardKeys} onForwardsChanged={onRoutesChanged} />}
        {activeTab === 'shell' && (
          <ShellTab
            agent={agent}
            isActive={isActive}
            disabled={capabilities.shell === false || agent.shell_enabled !== true}
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
