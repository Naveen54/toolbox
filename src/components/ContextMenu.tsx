import React, { useEffect, useRef } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import './ContextMenu.scss';

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    onRename: () => void;
    onDelete: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onRename, onDelete }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            className="context-menu glass-panel fade-in"
            style={{ top: y, left: x }}
            ref={menuRef}
        >
            <button className="menu-item" onClick={() => { onRename(); onClose(); }}>
                <Edit2 size={14} />
                <span>Rename</span>
            </button>
            <button className="menu-item delete" onClick={() => { onDelete(); onClose(); }}>
                <Trash2 size={14} />
                <span>Delete</span>
            </button>
        </div>
    );
};
