import { useState, useCallback } from 'react';
import type { TopologyAgentInfo, MeshTestResult } from '../../api/types';

interface InfoTabProps {
  agent: TopologyAgentInfo;
  meshResult: MeshTestResult | undefined;
}

export default function InfoTab({ agent, meshResult }: InfoTabProps) {
  const [copyHint, setCopyHint] = useState('Click to copy');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(agent.id || agent.short_id).then(() => {
      setCopyHint('Copied!');
      setTimeout(() => setCopyHint('Click to copy'), 1500);
    });
  }, [agent]);

  const roles = agent.roles || ['transit'];

  let uptimeStr = '';
  if (agent.uptime_hours > 0) {
    const hours = agent.uptime_hours;
    if (hours < 1) uptimeStr = `${Math.round(hours * 60)}m`;
    else if (hours < 24) uptimeStr = `${Math.round(hours)}h`;
    else {
      const days = Math.floor(hours / 24);
      const rem = Math.round(hours % 24);
      uptimeStr = `${days}d ${rem}h`;
    }
  }

  const exitRoutes = agent.exit_routes || [];
  const domainRoutes = agent.domain_routes || [];
  const forwardListeners = agent.forward_listeners || [];
  const forwardEndpoints = agent.forward_endpoints || [];

  return (
    <div className="info-tab">
      {/* Roles */}
      {roles.length > 0 && (
        <div className="info-roles">
          {roles.map(role => (
            <span key={role} className={`tooltip-role-badge ${role}`}>{role}</span>
          ))}
        </div>
      )}

      {/* Reachability */}
      {meshResult && (
        <div className="info-section">
          <div className="info-section-header">Reachability</div>
          {meshResult.reachable ? (
            <div className="info-reachability-ok">
              OK ({meshResult.is_local ? 'local' : `${meshResult.response_time_ms}ms`})
            </div>
          ) : (
            <div className="info-reachability-error">
              FAILED: {meshResult.error || 'unreachable'}
            </div>
          )}
        </div>
      )}

      {/* Details */}
      <div className="info-details">
        {agent.hostname && (
          <div className="info-line">
            <span className="info-label">Hostname</span>
            <span className="info-value">{agent.hostname}</span>
          </div>
        )}
        {(agent.os || agent.arch) && (
          <div className="info-line">
            <span className="info-label">Platform</span>
            <span className="info-value">{[agent.os, agent.arch].filter(Boolean).join('/')}</span>
          </div>
        )}
        {agent.version && (
          <div className="info-line">
            <span className="info-label">Version</span>
            <span className="info-value">{agent.version}</span>
          </div>
        )}
        {uptimeStr && (
          <div className="info-line">
            <span className="info-label">Uptime</span>
            <span className="info-value">{uptimeStr}</span>
          </div>
        )}
        {agent.ip_addresses && agent.ip_addresses.length > 0 && (
          <div className="info-line">
            <span className="info-label">IPs</span>
            <span className="info-value">
              {agent.ip_addresses.join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* SOCKS5 */}
      {agent.socks5_addr && (
        <div className="info-section">
          <div className="info-section-header socks5">SOCKS5 Proxy</div>
          <div className="info-section-value">{agent.socks5_addr}</div>
        </div>
      )}

      {/* UDP */}
      {agent.udp_enabled && (
        <div className="info-section">
          <div className="info-section-header udp">UDP Relay</div>
          <div className="info-section-value">Enabled</div>
        </div>
      )}

      {/* Exit Routes */}
      {exitRoutes.length > 0 && (
        <div className="info-section">
          <div className="info-section-header exits">CIDR Routes ({exitRoutes.length})</div>
          <div className="info-routes-list">
            {exitRoutes.map(cidr => (
              <span key={cidr} className="info-cidr">{cidr}</span>
            ))}
          </div>
        </div>
      )}

      {/* Domain Routes */}
      {domainRoutes.length > 0 && (
        <div className="info-section">
          <div className="info-section-header exits">Domain Routes ({domainRoutes.length})</div>
          <div className="info-routes-list">
            {domainRoutes.map(domain => (
              <span key={domain} className="info-domain">{domain}</span>
            ))}
          </div>
        </div>
      )}

      {/* Port Forwards */}
      {(forwardListeners.length > 0 || forwardEndpoints.length > 0) && (
        <div className="info-section">
          {forwardListeners.length > 0 && (
            <>
              <div className="info-section-header forwards">Port Forward Listeners</div>
              <div className="info-routes-list">
                {forwardListeners.map(key => (
                  <span key={key} className="info-forward-key">{key}</span>
                ))}
              </div>
            </>
          )}
          {forwardEndpoints.length > 0 && (
            <>
              <div className="info-section-header forwards" style={{ marginTop: '0.5rem' }}>Port Forward Endpoints</div>
              <div className="info-routes-list">
                {forwardEndpoints.map(key => (
                  <span key={key} className="info-forward-key">{key}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Agent ID */}
      <div className="info-id-section" onClick={handleCopy}>
        <div className="info-id-label">Agent ID</div>
        <div className="info-id">{agent.id || agent.short_id}</div>
        <div className={`info-id-hint${copyHint === 'Copied!' ? ' copied' : ''}`}>{copyHint}</div>
      </div>
    </div>
  );
}
