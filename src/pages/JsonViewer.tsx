import React, { useState, useEffect } from 'react';
import ReactJson from 'react-json-view';
import { AlertCircle, Check, Copy, Trash2 } from 'lucide-react';
import { Label } from 'react-aria-components';
import './JsonViewer.scss';
import { withPageView } from '../utils/withPageView';
import { trackEvent } from '../utils/analytics';

const JsonViewerPage: React.FC = () => {
    const [input, setInput] = useState<string>('');
    const [json, setJson] = useState<object | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;

        fetch('https://jsonplaceholder.typicode.com/todos/1')
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load default JSON (${response.status})`);
                }
                return response.json();
            })
            .then((data) => {
                if (!cancelled) {
                    setInput(JSON.stringify(data, null, 2));
                    setLoadError(null);
                }
            })
            .catch((e) => {
                if (!cancelled) {
                    setLoadError((e as Error).message);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        try {
            if (!input.trim()) {
                setJson(null);
                setError(null);
                return;
            }
            const parsed = JSON.parse(input);
            setJson(parsed);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
            setJson(null);
        }
    }, [input]);

    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(json, null, 2));
        setCopied(true);
        trackEvent('json_copy_clicked', { has_json: Boolean(json) });
        setTimeout(() => setCopied(false), 2000);
    };

    const handleFormat = () => {
        if (json) {
            setInput(JSON.stringify(json, null, 2));
            trackEvent('json_format_clicked', { has_json: true });
        }
    };

    const handleClear = () => {
        setInput('');
        trackEvent('json_clear_clicked');
    };

    return (
        <div className="json-viewer-page fade-in">
            <div className="page-header">
                <h2>JSON Viewer</h2>
                <div className="actions">
                    <button className="btn-secondary" onClick={handleClear} title="Clear">
                        <Trash2 size={18} />
                        <span>Clear</span>
                    </button>
                    <button className="btn-secondary" onClick={handleFormat} disabled={!json} title="Format JSON">
                        <Check size={18} />
                        <span>Format</span>
                    </button>
                    <button className="btn-primary" onClick={handleCopy} disabled={!json} title="Copy JSON">
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                        <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                </div>
            </div>

            <div className="split-pane">
                <div className="pane input-pane glass-panel">
                    <div className="pane-header">
                        <Label>Input</Label>
                        {error && <span className="error-badge"><AlertCircle size={14} /> Invalid JSON</span>}
                        {loadError && <span className="error-badge"><AlertCircle size={14} /> Default API failed</span>}
                    </div>
                    <textarea
                        className="json-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Paste your JSON here..."
                        spellCheck={false}
                    />
                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}
                    {loadError && (
                        <div className="error-message">
                            {loadError}
                        </div>
                    )}
                </div>

                <div className="pane preview-pane glass-panel">
                    <div className="pane-header">
                        <Label>Preview</Label>
                    </div>
                    <div className="json-tree-container">
                        {json ? (
                            <ReactJson
                                src={json}
                                theme="ocean"
                                style={{ background: 'transparent' }}
                                displayDataTypes={false}
                                enableClipboard={false}
                            />
                        ) : (
                            <div className="empty-state">
                                {error ? 'Fix errors to see preview' : 'Enter JSON to view tree'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const JsonViewer = withPageView(JsonViewerPage, 'JSON Viewer');
