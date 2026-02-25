import { useState, useCallback } from 'react';

interface TokenDialogProps {
  onSubmit: (token: string) => void;
}

export default function TokenDialog({ onSubmit }: TokenDialogProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    setError(false);
    onSubmit(trimmed);
  }, [value, onSubmit]);

  return (
    <div className="token-dialog-overlay">
      <form className="token-dialog" onSubmit={handleSubmit}>
        <div className="token-dialog-header">Authentication Required</div>
        <div className="token-dialog-body">
          <p>The Muti Metroo agent requires a bearer token. Enter the token to continue.</p>
          <input
            className={`panel-input token-dialog-input${error ? ' input-error' : ''}`}
            type="password"
            placeholder="Bearer token"
            value={value}
            onChange={e => { setValue(e.target.value); setError(false); }}
            autoFocus
          />
        </div>
        <div className="token-dialog-footer">
          <button type="submit" className="panel-btn token-dialog-btn">
            Authenticate
          </button>
        </div>
      </form>
    </div>
  );
}
