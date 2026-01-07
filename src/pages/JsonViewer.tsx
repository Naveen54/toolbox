import React, { useState, useEffect } from 'react';
import ReactJson from 'react-json-view';
import { AlertCircle, Check, Copy, Trash2 } from 'lucide-react';
import { Label } from 'react-aria-components';
import './JsonViewer.scss';

export const JsonViewer: React.FC = () => {
    const [input, setInput] = useState<string>('{\n  "welcome": "to DevToolbox",\n  "features": [\n    "JSON Viewer",\n    "Premium Design"\n  ]\n}');
    const [json, setJson] = useState<object | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

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
        setTimeout(() => setCopied(false), 2000);
    };

    const handleFormat = () => {
        if (json) {
            setInput(JSON.stringify(json, null, 2));
        }
    };

    const handleClear = () => {
        setInput('');
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
