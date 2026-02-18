import type { MeshTestResponse } from '../api/types';

interface TestResultsModalProps {
  type: 'success' | 'error';
  data?: MeshTestResponse;
  error?: string;
  onClose: () => void;
}

export default function TestResultsModal({ type, data, error, onClose }: TestResultsModalProps) {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (type === 'error') {
    return (
      <div className="test-modal-overlay" onClick={handleOverlayClick}>
        <div className="test-modal">
          <div className="test-modal-header">
            <span>Mesh Test Results</span>
            <button className="test-modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="test-modal-error">{error || 'Mesh test failed'}</div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const reachable = data.reachable_count ?? 0;
  const total = data.total_count ?? 0;
  const duration = data.duration_ms ?? 0;
  const allPass = reachable === total;
  const remoteResults = (data.results || []).filter(r => !r.is_local);

  return (
    <div className="test-modal-overlay" onClick={handleOverlayClick}>
      <div className="test-modal">
        <div className="test-modal-header">
          <span>Mesh Test Results</span>
          <button className="test-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className={`test-modal-summary ${allPass ? 'summary-ok' : 'summary-warn'}`}>
          {reachable}/{total} reachable &middot; {duration}ms
        </div>
        <div className="test-modal-list">
          {remoteResults.map(r => (
            <div className="test-modal-row" key={r.agent_id}>
              <span className={`test-modal-dot ${r.reachable ? 'dot-ok' : 'dot-err'}`} />
              <span className="test-modal-name">{r.display_name || r.short_id}</span>
              <span className="test-modal-latency">
                {r.reachable
                  ? `${r.response_time_ms}ms`
                  : <span className="test-modal-row-error">{r.error || 'unreachable'}</span>
                }
              </span>
            </div>
          ))}
          {remoteResults.length === 0 && (
            <div className="tab-empty">No remote agents</div>
          )}
        </div>
      </div>
    </div>
  );
}
