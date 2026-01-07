import React, { useState, useEffect } from 'react';
import {
    Search,
    Folder,
    File,
    ChevronRight,
    Download,
    LogIn,
    LogOut,
    MoreVertical,
    FolderOpen,
    Loader2,
    CheckCircle2,
    DownloadCloud
} from 'lucide-react';
import {
    Button,
    Link,
    Breadcrumbs,
    Breadcrumb,
    TooltipTrigger,
    Tooltip,
    ProgressBar
} from 'react-aria-components';
import './GoogleDriveDownloader.scss';
import { fetchFolderContentsRecursive, getFileHandleRecursive } from '../utils/gdriveUtils';
import type { GDriveFile } from '../utils/gdriveUtils';

interface DriveItem {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
}

interface UserInfo {
    name: string;
    email: string;
    picture: string;
}

interface DownloadProgress {
    [key: string]: {
        downloaded: number;
        total: number;
        status: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED';
    };
}

export const GoogleDriveDownloader: React.FC = () => {
    const [url, setUrl] = useState('');
    const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_token'));
    const [user, setUser] = useState<UserInfo | null>(null);
    const [items, setItems] = useState<DriveItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Download related state
    const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({});
    const [itemLoading, setItemLoading] = useState<{ [key: string]: boolean }>({});
    const isFirefox = typeof (window as any).InstallTrigger !== 'undefined';

    const CLIENT_ID = '1005080280366-oomuptpmo0lr51cnr7q0trkhpmt5vgsf.apps.googleusercontent.com';

    const handleLogin = () => {
        const scope = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
        const redirectUri = window.location.origin + '/gdrive-downloader';
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}`;
        window.location.href = authUrl;
    };

    const fetchUserInfo = async (token: string) => {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            setUser({
                name: data.name,
                email: data.email,
                picture: data.picture
            });
        } catch (e) {
            console.error('Failed to fetch user info', e);
        }
    };

    useEffect(() => {
        const hash = window.location.hash;
        if (hash) {
            const params = new URLSearchParams(hash.substring(1));
            const token = params.get('access_token');
            if (token) {
                setAccessToken(token);
                sessionStorage.setItem('gdrive_token', token);
                fetchUserInfo(token);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } else if (accessToken) {
            fetchUserInfo(accessToken);
        }
    }, [accessToken]);

    const extractFolderId = (url: string) => {
        const match = url.match(/[-\w]{25,}/);
        return match ? match[0] : null;
    };

    const fetchFolderContents = async (folderId: string, folderName: string = 'Root') => {
        if (!accessToken) {
            setError('Please sign in first');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size)`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );
            const data = await response.json();
            if (data.error) {
                console.error('[Retrieve Error Detail]', data.error);
                throw new Error(data.error.message);
            }

            setItems(data.files || []);
            if (!breadcrumb.find(b => b.id === folderId)) {
                setBreadcrumb([...breadcrumb, { id: folderId, name: folderName }]);
            }
        } catch (err) {
            console.error('[Retrieve Failed]', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch contents');
        } finally {
            setLoading(false);
        }
    };

    const handleRetrieve = () => {
        const id = extractFolderId(url);
        if (id) {
            setBreadcrumb([]);
            fetchFolderContents(id, 'Home');
        } else {
            setError('Invalid Google Drive URL');
        }
    };

    const handleFolderClick = (item: DriveItem) => {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            fetchFolderContents(item.id, item.name);
        }
    };

    const navigateToBreadcrumb = (id: string, name: string, index: number) => {
        const newBreadcrumb = breadcrumb.slice(0, index + 1);
        setBreadcrumb(newBreadcrumb);
        fetchFolderContents(id, name);
    };

    const formatSize = (bytes?: string) => {
        if (!bytes) return '--';
        const b = parseInt(bytes);
        const k = 1024;
        const dm = 2;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (b === 0) return '0 Bytes';
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const ensureDirectoryHandle = async () => {
        if (directoryHandle) return directoryHandle;
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setDirectoryHandle(handle);
            return handle;
        } catch (e) {
            console.error('Directory picker cancelled or failed', e);
            return null;
        }
    };

    const getExportMimeType = (mimeType: string) => {
        switch (mimeType) {
            case 'application/vnd.google-apps.document':
                return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' };
            case 'application/vnd.google-apps.spreadsheet':
                return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' };
            case 'application/vnd.google-apps.presentation':
                return { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' };
            case 'application/vnd.google-apps.drawing':
                return { mime: 'image/png', ext: '.png' };
            default:
                return null;
        }
    };

    const downloadFile = async (rootHandle: FileSystemDirectoryHandle, file: GDriveFile) => {
        const fileId = file.id;
        const exportConfig = getExportMimeType(file.mimeType);
        const fileName = exportConfig ? `${file.name}${exportConfig.ext}` : file.name;
        const size = parseInt(file.size || '0');

        setDownloadProgress(prev => ({
            ...prev,
            [fileId]: { downloaded: 0, total: size, status: 'DOWNLOADING' }
        }));

        try {
            const fileHandle = await getFileHandleRecursive(rootHandle, file.path ? (file.path + (exportConfig ? exportConfig.ext : '')) : fileName);

            if (exportConfig) {
                // Single-stream download for Google Workspace exports
                const response = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${exportConfig.mime}`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );

                if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);

                const writable = await fileHandle.createWritable();
                await response.body?.pipeTo(writable);

                setDownloadProgress(prev => ({
                    ...prev,
                    [fileId]: { ...prev[fileId], status: 'COMPLETED', downloaded: size || 100, total: size || 100 }
                }));
                return;
            }

            // Parallel chunked download for binary files
            const worker = new Worker(new URL('../workers/gdriveDownloadWorker.ts', import.meta.url), { type: 'module' });

            worker.postMessage({
                fileHandler: fileHandle,
                fileId,
                accessToken,
                size
            });

            return new Promise<void>((resolve, reject) => {
                worker.onmessage = (event) => {
                    const { type, downloaded, error } = event.data;
                    if (type === 'PROGRESS') {
                        setDownloadProgress(prev => ({
                            ...prev,
                            [fileId]: {
                                ...prev[fileId],
                                downloaded: prev[fileId].downloaded + downloaded
                            }
                        }));
                    } else if (type === 'DOWNLOAD_COMPLETED') {
                        setDownloadProgress(prev => ({
                            ...prev,
                            [fileId]: { ...prev[fileId], status: 'COMPLETED' }
                        }));
                        worker.terminate();
                        resolve();
                    } else if (type === 'DOWNLOAD_FAILED') {
                        setDownloadProgress(prev => ({
                            ...prev,
                            [fileId]: { ...prev[fileId], status: 'FAILED' }
                        }));
                        worker.terminate();
                        reject(new Error(error));
                    }
                };
            });
        } catch (e) {
            setDownloadProgress(prev => ({
                ...prev,
                [fileId]: { ...prev[fileId], status: 'FAILED' }
            }));
            throw e;
        }
    };

    const handleDownloadItem = async (item: DriveItem) => {
        const rootHandle = await ensureDirectoryHandle();
        if (!rootHandle || !accessToken) return;

        if (item.mimeType === 'application/vnd.google-apps.folder') {
            setItemLoading(prev => ({ ...prev, [item.id]: true }));
            try {
                const allFiles = await fetchFolderContentsRecursive(accessToken, item.id, item.name);
                for (const file of allFiles) {
                    await downloadFile(rootHandle, file);
                }
            } catch (e) {
                setError('Folder download failed');
            } finally {
                setItemLoading(prev => ({ ...prev, [item.id]: false }));
            }
        } else {
            downloadFile(rootHandle, { ...item, path: item.name });
        }
    };

    const handleDownloadAll = async () => {
        const rootHandle = await ensureDirectoryHandle();
        if (!rootHandle || !accessToken || items.length === 0) return;

        setLoading(true);
        try {
            for (const item of items) {
                if (item.mimeType === 'application/vnd.google-apps.folder') {
                    const allFiles = await fetchFolderContentsRecursive(accessToken, item.id, item.name);
                    for (const file of allFiles) {
                        await downloadFile(rootHandle, file);
                    }
                } else {
                    await downloadFile(rootHandle, { ...item, path: item.name });
                }
            }
        } catch (e) {
            setError('Bulk download failed');
        } finally {
            setLoading(false);
        }
    };

    const renderDownloadButton = (item: DriveItem) => {
        const progress = downloadProgress[item.id];
        const isGoogleAppsFile = item.mimeType.startsWith('application/vnd.google-apps.') &&
            item.mimeType !== 'application/vnd.google-apps.folder';
        const isExportable = !!getExportMimeType(item.mimeType);
        const canDownload = !isGoogleAppsFile || isExportable;

        if (progress?.status === 'COMPLETED') {
            return (
                <div className="icon-btn status-done">
                    <CheckCircle2 className="text-success" size={18} />
                </div>
            );
        }

        const content = (
            <Button
                className={`icon-btn ${(isFirefox || !canDownload) ? 'disabled' : ''}`}
                isDisabled={isFirefox || !canDownload || (progress?.status === 'DOWNLOADING')}
                onPress={() => handleDownloadItem(item)}
            >
                {(progress?.status === 'DOWNLOADING' || itemLoading[item.id]) ? (
                    <Loader2 className="animate-spin" size={18} />
                ) : (
                    <Download size={18} />
                )}
            </Button>
        );

        if (isFirefox || !canDownload) {
            return (
                <TooltipTrigger>
                    {content}
                    <Tooltip className="tooltip-content">
                        {isFirefox
                            ? 'Local folder selection is not supported in Firefox. Please use Chrome or Edge.'
                            : 'This specific Google Apps file type cannot be exported currently.'}
                    </Tooltip>
                </TooltipTrigger>
            );
        }

        return content;
    };

    return (
        <div className="gdrive-downloader-page fade-in">
            <header className="page-header">
                <div className="header-title">
                    <h2>Google Drive Downloader</h2>
                    <p className="subtitle">Browse and manage public Google Drive folders</p>
                </div>
                <div className="header-actions">
                    {accessToken ? (
                        <div className="user-profile">
                            {user && (
                                <div className="user-info">
                                    <div className="user-details">
                                        <span className="user-name">{user.name}</span>
                                        <span className="user-email">{user.email}</span>
                                    </div>
                                    <img src={user.picture} alt={user.name} className="user-avatar" />
                                </div>
                            )}
                            <Button className="btn-secondary sign-out-btn" onPress={() => {
                                setAccessToken(null);
                                setUser(null);
                                sessionStorage.removeItem('gdrive_token');
                            }}>
                                <LogOut size={18} />
                                <span>Sign Out</span>
                            </Button>
                        </div>
                    ) : (
                        <Button className="btn-primary" onPress={handleLogin}>
                            <LogIn size={18} />
                            <span>Sign In</span>
                        </Button>
                    )}
                </div>
            </header>

            <div className="search-container glass-panel">
                <div className="input-group">
                    <div className="input-wrapper">
                        <Search className="input-icon" size={20} />
                        <input
                            type="text"
                            placeholder="Paste public Google Drive folder link..."
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRetrieve()}
                        />
                    </div>
                    <Button className="btn-primary" onPress={handleRetrieve} isDisabled={loading}>
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Retrieve'}
                    </Button>
                </div>
                {error && <div className="error-text">{error}</div>}
            </div>

            <div className="explorer-container glass-panel">
                <div className="explorer-header">
                    <Breadcrumbs className="breadcrumb">
                        {breadcrumb.length > 0 ? (
                            breadcrumb.map((crumb, index) => (
                                <Breadcrumb key={crumb.id} className="crumb-item-wrapper">
                                    <Link
                                        className={`crumb-item ${index === breadcrumb.length - 1 ? 'active' : ''}`}
                                        onPress={() => navigateToBreadcrumb(crumb.id, crumb.name, index)}
                                    >
                                        {index === 0 ? <Folder size={16} /> : null}
                                        {crumb.name}
                                    </Link>
                                    {index < breadcrumb.length - 1 && <ChevronRight size={14} className="separator" />}
                                </Breadcrumb>
                            ))
                        ) : (
                            <Breadcrumb><span className="crumb-item active">Explorer</span></Breadcrumb>
                        )}
                    </Breadcrumbs>

                    {items.length > 0 && (
                        <Button
                            className={`btn-download-all ${isFirefox ? 'disabled' : ''}`}
                            isDisabled={isFirefox || loading}
                            onPress={handleDownloadAll}
                        >
                            <DownloadCloud size={18} />
                            <span>Download All</span>
                        </Button>
                    )}
                </div>

                <div className="explorer-view">
                    <div className="view-header">
                        <div className="col-name">Name</div>
                        <div className="col-size">Size</div>
                        <div className="col-actions">Actions</div>
                    </div>
                    <div className="view-content">
                        {loading ? (
                            <div className="loading-state">
                                <Loader2 className="animate-spin" size={48} />
                                <p>Fetching contents...</p>
                            </div>
                        ) : items.length > 0 ? (
                            items.map(item => {
                                const progress = downloadProgress[item.id];
                                return (
                                    <div key={item.id} className="item-row-container">
                                        <div
                                            className={`item-row ${item.mimeType === 'application/vnd.google-apps.folder' ? 'folder-row' : ''}`}
                                            onClick={() => handleFolderClick(item)}
                                        >
                                            <div className="col-name">
                                                <span className="item-icon">
                                                    {item.mimeType === 'application/vnd.google-apps.folder' ? (
                                                        <FolderOpen className="icon-folder" size={20} />
                                                    ) : (
                                                        <File className="icon-file" size={20} />
                                                    )}
                                                </span>
                                                <span className="item-name">{item.name}</span>
                                            </div>
                                            <div className="col-size">
                                                {item.mimeType === 'application/vnd.google-apps.folder' ? '--' : formatSize(item.size)}
                                            </div>
                                            <div className="col-actions">
                                                {renderDownloadButton(item)}
                                                <Button className="icon-btn">
                                                    <MoreVertical size={18} />
                                                </Button>
                                            </div>
                                        </div>
                                        {progress && progress.status === 'DOWNLOADING' && (
                                            <ProgressBar
                                                value={progress.total > 0 ? (progress.downloaded / progress.total) * 100 : 0}
                                                className="item-progress"
                                            >
                                                {({ percentage }) => (
                                                    <div className="progress-bar-fill" style={{ width: `${percentage}%` }} />
                                                )}
                                            </ProgressBar>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="empty-state">
                                <div className="empty-icon">
                                    <Folder size={64} opacity={0.2} />
                                </div>
                                <h3>No files found</h3>
                                <p>Paste a public folder link to get started.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
