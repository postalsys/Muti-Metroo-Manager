import { useState, useCallback } from 'react';
import type { TopologyAgentInfo } from '../../api/types';
import { ERR_FILE_TRANSFER_DENIED } from '../../api/types';
import { downloadFile, uploadFile } from '../../api/client';

interface FilesTabProps {
  agent: TopologyAgentInfo;
  disabled: boolean;
  onDisabled: () => void;
}

export default function FilesTab({ agent, disabled, onDisabled }: FilesTabProps) {
  // Download state
  const [downloadPath, setDownloadPath] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  // Upload state
  const [uploadRemotePath, setUploadRemotePath] = useState('');
  const [uploadFile_, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const checkFileTransferDenied = useCallback((err: any) => {
    const msg = err.message || '';
    if (msg.includes(String(ERR_FILE_TRANSFER_DENIED)) || msg.includes('ERR_FILE_TRANSFER_DENIED')) {
      onDisabled();
    }
  }, [onDisabled]);

  const handleDownload = useCallback(async () => {
    if (!downloadPath.trim()) return;
    setDownloading(true);
    setDownloadError(null);
    setDownloadSuccess(null);
    try {
      const blob = await downloadFile(agent.id, downloadPath.trim());
      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadPath.trim().split('/').pop() || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadSuccess(`Downloaded ${downloadPath.trim()}`);
    } catch (err: any) {
      setDownloadError(err.message || 'Download failed');
      checkFileTransferDenied(err);
    } finally {
      setDownloading(false);
    }
  }, [agent.id, downloadPath, checkFileTransferDenied]);

  const handleUpload = useCallback(async () => {
    if (!uploadFile_ || !uploadRemotePath.trim()) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      await uploadFile(agent.id, uploadFile_, uploadRemotePath.trim());
      setUploadSuccess(`Uploaded to ${uploadRemotePath.trim()}`);
      setUploadFile(null);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
      checkFileTransferDenied(err);
    } finally {
      setUploading(false);
    }
  }, [agent.id, uploadFile_, uploadRemotePath, checkFileTransferDenied]);

  if (disabled) {
    return (
      <div className="tab-disabled-msg">
        File transfer is not enabled on this agent
      </div>
    );
  }

  return (
    <div className="files-tab">
      {/* Download section */}
      <div className="files-section">
        <div className="files-section-header">Download</div>
        <div className="files-form">
          <input
            type="text"
            className="panel-input"
            placeholder="Remote path (e.g. /etc/hosts)"
            value={downloadPath}
            onChange={e => setDownloadPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleDownload()}
          />
          <button className="panel-btn" onClick={handleDownload} disabled={downloading || !downloadPath.trim()}>
            {downloading ? 'Downloading...' : 'Download'}
          </button>
        </div>
        {downloadError && <div className="tab-error">{downloadError}</div>}
        {downloadSuccess && <div className="tab-success">{downloadSuccess}</div>}
      </div>

      {/* Upload section */}
      <div className="files-section">
        <div className="files-section-header">Upload</div>
        <div className="files-form">
          <input
            type="file"
            className="panel-file-input"
            onChange={e => setUploadFile(e.target.files?.[0] || null)}
          />
          <input
            type="text"
            className="panel-input"
            placeholder="Remote path (e.g. /tmp/file.txt)"
            value={uploadRemotePath}
            onChange={e => setUploadRemotePath(e.target.value)}
          />
          <button
            className="panel-btn"
            onClick={handleUpload}
            disabled={uploading || !uploadFile_ || !uploadRemotePath.trim()}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        {uploadError && <div className="tab-error">{uploadError}</div>}
        {uploadSuccess && <div className="tab-success">{uploadSuccess}</div>}
      </div>
    </div>
  );
}
