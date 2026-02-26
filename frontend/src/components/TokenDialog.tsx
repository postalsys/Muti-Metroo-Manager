import { useState } from 'react';

interface TokenDialogProps {
  onSubmit: (token: string) => Promise<void>;
}

export default function TokenDialog({ onSubmit }: TokenDialogProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [validating, setValidating] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    setError(false);
    setErrorMessage('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    setError(false);
    setErrorMessage('');
    setValidating(true);
    try {
      await onSubmit(trimmed);
    } catch {
      setError(true);
      setErrorMessage('Invalid token');
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="token-dialog-overlay">
      <form className="token-dialog" onSubmit={handleSubmit}>
        <div className="token-dialog-header">Authentication Required</div>
        <div className="token-dialog-body">
          <p>The Muti Metroo agent requires a bearer token. Enter the token to continue.</p>
          <input
            className={`panel-input token-dialog-input${error ? ' input-error' : ''}`}
            type="password"
            name="token"
            placeholder="Bearer token"
            value={value}
            onChange={handleChange}
            disabled={validating}
            autoFocus
            autoComplete="current-password"
          />
          {errorMessage && <p className="token-dialog-error">{errorMessage}</p>}
        </div>
        <div className="token-dialog-footer">
          <button type="submit" className="panel-btn token-dialog-btn" disabled={validating}>
            {validating ? 'Validating...' : 'Authenticate'}
          </button>
        </div>
      </form>
    </div>
  );
}
