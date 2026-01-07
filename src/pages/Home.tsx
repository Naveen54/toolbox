import React from 'react';
import { FileJson, FileText, ArrowRight, FolderOpen, Hash } from 'lucide-react';
import { Link } from 'react-router-dom';
import './Home.scss';

export const Home: React.FC = () => {
    return (
        <div className="home-page fade-in">
            <header className="home-header">
                <h1 className="welcome-title">Welcome to <span className="gradient-text">DevToolbox</span></h1>
                <p className="welcome-subtitle">Essential tools for modern developers, all in one place.</p>
            </header>

            <div className="tools-grid">
                <Link to="/json-viewer" className="tool-card glass-panel">
                    <div className="tool-icon">
                        <FileJson size={32} />
                    </div>
                    <div className="tool-info">
                        <h3>JSON Viewer</h3>
                        <p>Format, validate, and explore JSON data with a beautiful tree view.</p>
                    </div>
                    <div className="tool-action">
                        <ArrowRight size={20} />
                    </div>
                </Link>

                <Link to="/notes" className="tool-card glass-panel">
                    <div className="tool-icon">
                        <FileText size={32} />
                    </div>
                    <div className="tool-info">
                        <h3>Notes Editor</h3>
                        <p>Create, edit, and manage markdown notes with a live preview.</p>
                    </div>
                    <div className="tool-action">
                        <ArrowRight size={20} />
                    </div>
                </Link>

                <Link to="/gdrive-downloader" className="tool-card glass-panel">
                    <div className="tool-icon">
                        <FolderOpen size={32} />
                    </div>
                    <div className="tool-info">
                        <h3>GDrive Downloader</h3>
                        <p>Browse public Google Drive folders and get direct download links.</p>
                    </div>
                    <div className="tool-action">
                        <ArrowRight size={20} />
                    </div>
                </Link>

                <Link to="/file-hasher" className="tool-card glass-panel">
                    <div className="tool-icon">
                        <Hash size={32} />
                    </div>
                    <div className="tool-info">
                        <h3>File Hasher</h3>
                        <p>Generate cryptographic hashes (MD5, SHA1, SHA256, SHA512) for files using Go WASM.</p>
                    </div>
                    <div className="tool-action">
                        <ArrowRight size={20} />
                    </div>
                </Link>

                {/* Placeholder for future tools */}
                <div className="tool-card glass-panel coming-soon">
                    <div className="tool-icon">
                        <div className="icon-placeholder" />
                    </div>
                    <div className="tool-info">
                        <h3>More Tools Coming Soon</h3>
                        <p>We are constantly adding new utilities to help your workflow.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
