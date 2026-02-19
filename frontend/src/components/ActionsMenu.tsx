import { useState, useRef, useEffect } from 'react';
import type { SleepStatusResponse } from '../api/types';

interface ActionsMenuProps {
  sleepStatus: SleepStatusResponse | null;
  sleepLoading: boolean;
  testing: boolean;
  onSleep: () => void;
  onWake: () => void;
  onRunTest: () => void;
}

function getSleepMenuItem(
  status: SleepStatusResponse | null,
  loading: boolean,
): { label: string; dot: string; disabled: boolean; action: 'sleep' | 'wake' | null } | null {
  if (!status?.enabled) return null;

  if (loading) {
    const isSuspending = status.state === 'AWAKE';
    return {
      label: isSuspending ? 'Suspending...' : 'Resuming...',
      dot: isSuspending ? 'sleep' : 'wake',
      disabled: true,
      action: null,
    };
  }

  switch (status.state) {
    case 'AWAKE':
      return { label: 'Suspend Mesh', dot: 'sleep', disabled: false, action: 'sleep' };
    case 'SLEEPING':
      return { label: 'Resume Mesh', dot: 'wake', disabled: false, action: 'wake' };
    case 'POLLING':
      return { label: 'Transitioning...', dot: 'polling', disabled: true, action: null };
    default:
      return null;
  }
}

export default function ActionsMenu({ sleepStatus, sleepLoading, testing, onSleep, onWake, onRunTest }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmingSleep, setConfirmingSleep] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmingSleep(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function closeAndRun(action: () => void): void {
    setOpen(false);
    action();
  }

  function handleConfirmSleep(): void {
    setOpen(false);
    setConfirmingSleep(false);
    onSleep();
  }

  const sleepItem = getSleepMenuItem(sleepStatus, sleepLoading);

  function handleSleepItemClick(): void {
    if (!sleepItem || sleepItem.disabled) return;
    if (sleepItem.action === 'sleep') {
      setConfirmingSleep(true);
    } else if (sleepItem.action === 'wake') {
      closeAndRun(onWake);
    }
  }

  return (
    <div className="actions-menu" ref={menuRef}>
      <button
        className="actions-menu-trigger"
        onClick={() => { setOpen(v => !v); setConfirmingSleep(false); }}
        aria-label="Actions"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="actions-menu-dropdown">
          {confirmingSleep ? (
            <div className="actions-confirm">
              <p className="sleep-confirm-msg">Put the mesh to sleep? All peer connections and tunnels will be suspended.</p>
              <div className="sleep-confirm-actions">
                <button className="sleep-confirm-cancel" onClick={() => setConfirmingSleep(false)}>Cancel</button>
                <button className="sleep-confirm-ok" onClick={handleConfirmSleep}>Confirm</button>
              </div>
            </div>
          ) : (
            <>
              <button
                className="actions-menu-item"
                onClick={() => closeAndRun(onRunTest)}
                disabled={testing}
              >
                <span className="actions-menu-dot test" />
                {testing ? 'Testing...' : 'Mesh Connectivity Test'}
              </button>

              {sleepItem && (
                <button
                  className="actions-menu-item"
                  onClick={handleSleepItemClick}
                  disabled={sleepItem.disabled}
                >
                  <span className={`actions-menu-dot ${sleepItem.dot}`} />
                  {sleepItem.label}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
