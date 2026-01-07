import React, { useState, useEffect, useCallback } from 'react';
import { Save, CheckCircle, Eye, Edit3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './MarkdownEditor.scss';

interface MarkdownEditorProps {
    fileHandle: FileSystemFileHandle;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ fileHandle }) => {
    const [content, setContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview');

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
                e.preventDefault();
                setViewMode(prev => prev === 'edit' ? 'preview' : 'edit');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        const loadFile = async () => {
            const file = await fileHandle.getFile();
            const text = await file.text();
            setContent(text);
            setLastSaved(new Date());
        };
        loadFile();
    }, [fileHandle]);

    const saveContent = useCallback(async (text: string) => {
        setIsSaving(true);
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(text);
            await writable.close();
            setLastSaved(new Date());
        } catch (err) {
            console.error('Failed to save:', err);
        } finally {
            setIsSaving(false);
        }
    }, [fileHandle]);

    // Debounce save
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (lastSaved && content) {
                saveContent(content);
            }
        }, 2000);

        return () => clearTimeout(timeoutId);
    }, [content, saveContent]);

    return (
        <div className="markdown-editor">
            <div className="editor-header">
                <div className="file-info">
                    <span className="filename">{fileHandle.name}</span>
                    <span className="status">
                        {isSaving ? (
                            <span className="saving"><Save size={12} className="spin" /> Saving...</span>
                        ) : (
                            <span className="saved"><CheckCircle size={12} /> Saved</span>
                        )}
                    </span>
                </div>
                <div className="view-controls">
                    <button
                        className={`view-btn ${viewMode === 'edit' ? 'active' : ''}`}
                        onClick={() => setViewMode('edit')}
                        title="Edit Mode (Ctrl+E)"
                    >
                        <Edit3 size={16} />
                        <span>Edit</span>
                    </button>
                    <button
                        className={`view-btn ${viewMode === 'preview' ? 'active' : ''}`}
                        onClick={() => setViewMode('preview')}
                        title="Preview Mode (Ctrl+E)"
                    >
                        <Eye size={16} />
                        <span>Preview</span>
                    </button>
                    <span className="shortcut-hint">Ctrl+E</span>
                </div>
            </div>

            <div className="editor-content">
                {viewMode === 'edit' ? (
                    <textarea
                        className="editor-textarea"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        spellCheck={false}
                        placeholder="Start writing..."
                    />
                ) : (
                    <div className="markdown-preview">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {content}
                        </ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
};
