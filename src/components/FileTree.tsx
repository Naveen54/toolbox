import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import './FileTree.scss';

interface FileTreeProps {
    handle: FileSystemDirectoryHandle;
    onSelectFile: (handle: FileSystemFileHandle) => void;
    selectedFile: FileSystemFileHandle | null;
    level?: number;
    onContextMenu?: (e: React.MouseEvent, handle: FileSystemHandle, parent: FileSystemDirectoryHandle) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ handle, onSelectFile, selectedFile, level = 0, onContextMenu }) => {
    const [entries, setEntries] = useState<(FileSystemDirectoryHandle | FileSystemFileHandle)[]>([]);
    const [isOpen, setIsOpen] = useState(level === 0); // Always open root

    useEffect(() => {
        const loadEntries = async () => {
            const newEntries = [];
            for await (const entry of handle.values()) {
                if (entry.kind === 'directory' || entry.name.endsWith('.md')) {
                    newEntries.push(entry);
                }
            }
            // Sort: Directories first, then files
            newEntries.sort((a, b) => {
                if (a.kind === b.kind) return a.name.localeCompare(b.name);
                return a.kind === 'directory' ? -1 : 1;
            });
            setEntries(newEntries);
        };

        if (isOpen) {
            loadEntries();
        }
    }, [handle, isOpen]);

    const toggleOpen = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    if (level !== 0 && !isOpen) return null;

    return (
        <div className="file-tree" style={{ paddingLeft: level === 0 ? 0 : '1rem' }}>
            {level !== 0 && (
                <div className="tree-item folder" onClick={toggleOpen}>
                    <span className="toggle-icon">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="icon">
                        {isOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
                    </span>
                    <span className="name">{handle.name}</span>
                </div>
            )}

            {(level === 0 || isOpen) && (
                <div className="tree-children">
                    {entries.map((entry) => (
                        <React.Fragment key={entry.name}>
                            {entry.kind === 'directory' ? (
                                <FileTree
                                    handle={entry as FileSystemDirectoryHandle}
                                    onSelectFile={onSelectFile}
                                    selectedFile={selectedFile}
                                    level={level + 1}
                                    onContextMenu={onContextMenu}
                                />
                            ) : (
                                <div
                                    className={`tree-item file ${selectedFile?.name === entry.name ? 'selected' : ''}`}
                                    onClick={() => onSelectFile(entry as FileSystemFileHandle)}
                                    onContextMenu={(e) => onContextMenu && onContextMenu(e, entry, handle)}
                                    style={{ paddingLeft: level === 0 ? '0.5rem' : '1.5rem' }}
                                >
                                    <span className="icon"><File size={14} /></span>
                                    <span className="name">{entry.name}</span>
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                    {entries.length === 0 && level !== 0 && (
                        <div className="empty-folder" style={{ paddingLeft: '1.5rem' }}>Empty</div>
                    )}
                </div>
            )}
        </div>
    );
};
