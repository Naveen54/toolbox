import React, { useState } from 'react';
import { FolderOpen, FileText, Plus } from 'lucide-react';
import { FileTree } from '../components/FileTree';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { Modal } from '../components/Modal';
import { ContextMenu } from '../components/ContextMenu';
import './NotesEditor.scss';

interface ContextMenuState {
    x: number;
    y: number;
    handle: FileSystemHandle;
    parent: FileSystemDirectoryHandle;
}

export const NotesEditor: React.FC = () => {
    const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
    const [selectedFile, setSelectedFile] = useState<FileSystemFileHandle | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Modal State
    const [modalMode, setModalMode] = useState<'create' | 'rename' | 'delete'>('create');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [fileNameInput, setFileNameInput] = useState('');

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    const handleOpenFolder = async () => {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setRootHandle(handle);
            setSelectedFile(null);
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Error opening folder:', err);
            }
        }
    };

    const handleContextMenu = (e: React.MouseEvent, handle: FileSystemHandle, parent: FileSystemDirectoryHandle) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            handle,
            parent
        });
    };

    const closeContextMenu = () => setContextMenu(null);

    const openCreateModal = () => {
        setModalMode('create');
        setFileNameInput('');
        setIsModalOpen(true);
    };

    const openRenameModal = () => {
        if (!contextMenu) return;
        setModalMode('rename');
        setFileNameInput(contextMenu.handle.name);
        setIsModalOpen(true);
    };

    const openDeleteModal = () => {
        if (!contextMenu) return;
        setModalMode('delete');
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rootHandle) return;

        try {
            if (modalMode === 'create') {
                if (!fileNameInput.trim()) return;
                const name = fileNameInput.trim();
                const fileName = name.endsWith('.md') ? name : `${name}.md`;
                await rootHandle.getFileHandle(fileName, { create: true });
            } else if (modalMode === 'rename' && contextMenu) {
                if (!fileNameInput.trim()) return;
                const name = fileNameInput.trim();
                const newName = name.endsWith('.md') ? name : `${name}.md`;

                // Rename logic: Copy content to new file, delete old file
                const oldFile = await contextMenu.parent.getFileHandle(contextMenu.handle.name);
                const newFile = await contextMenu.parent.getFileHandle(newName, { create: true });

                const fileData = await oldFile.getFile();
                const writable = await newFile.createWritable();
                await writable.write(await fileData.arrayBuffer());
                await writable.close();

                await contextMenu.parent.removeEntry(contextMenu.handle.name);

                if (selectedFile?.name === contextMenu.handle.name) {
                    setSelectedFile(null);
                }
            } else if (modalMode === 'delete' && contextMenu) {
                await contextMenu.parent.removeEntry(contextMenu.handle.name);
                if (selectedFile?.name === contextMenu.handle.name) {
                    setSelectedFile(null);
                }
            }

            setRefreshKey(prev => prev + 1);
            setIsModalOpen(false);
            setFileNameInput('');
            setContextMenu(null);
        } catch (err) {
            console.error(`Error during ${modalMode}:`, err);
            alert(`Failed to ${modalMode}: ${(err as Error).message}`);
        }
    };

    return (
        <div className="notes-editor-page fade-in" onClick={closeContextMenu}>
            {!rootHandle ? (
                <div className="empty-state-container">
                    <div className="empty-state glass-panel">
                        <FolderOpen size={48} className="icon" />
                        <h2>Open a Folder</h2>
                        <p>Select a local folder to start editing markdown notes.</p>
                        <button className="btn-primary" onClick={handleOpenFolder}>
                            Open Folder
                        </button>
                    </div>
                </div>
            ) : (
                <div className="editor-layout">
                    <aside className="file-sidebar glass-panel">
                        <div className="sidebar-header">
                            <span className="folder-name" title={rootHandle.name}>
                                {rootHandle.name}
                            </span>
                            <div className="actions">
                                <button className="btn-icon" onClick={openCreateModal} title="New File">
                                    <Plus size={18} />
                                    <span className="sr-only">New File</span>
                                </button>
                                <button className="btn-icon" onClick={handleOpenFolder} title="Change Folder">
                                    <FolderOpen size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="file-tree-container">
                            <FileTree
                                handle={rootHandle}
                                onSelectFile={setSelectedFile}
                                selectedFile={selectedFile}
                                key={refreshKey}
                                onContextMenu={handleContextMenu}
                            />
                        </div>
                    </aside>

                    <main className="editor-main glass-panel">
                        {selectedFile ? (
                            <MarkdownEditor fileHandle={selectedFile} />
                        ) : (
                            <div className="no-file-selected">
                                <FileText size={48} />
                                <p>Select a file to edit</p>
                            </div>
                        )}
                    </main>
                </div>
            )}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={closeContextMenu}
                    onRename={openRenameModal}
                    onDelete={openDeleteModal}
                />
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={
                    modalMode === 'create' ? "Create New Note" :
                        modalMode === 'rename' ? "Rename Note" : "Delete Note"
                }
            >
                <form onSubmit={handleSubmit} className="create-file-form">
                    {modalMode === 'delete' ? (
                        <div className="form-group">
                            <p>Are you sure you want to delete <strong>{contextMenu?.handle.name}</strong>?</p>
                            <p className="hint">This action cannot be undone.</p>
                        </div>
                    ) : (
                        <div className="form-group">
                            <label htmlFor="filename">File Name</label>
                            <input
                                id="filename"
                                type="text"
                                value={fileNameInput}
                                onChange={(e) => setFileNameInput(e.target.value)}
                                placeholder="e.g. meeting-notes"
                                autoFocus
                                className="text-input"
                            />
                            <span className="hint">.md extension will be added automatically</span>
                        </div>
                    )}

                    <div className="form-actions">
                        <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                        <button type="submit" className={`btn-primary ${modalMode === 'delete' ? 'danger' : ''}`}>
                            {modalMode === 'create' ? 'Create' : modalMode === 'rename' ? 'Rename' : 'Delete'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
