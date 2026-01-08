import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, FileJson, Settings, FileText, Hash, FolderOpen } from 'lucide-react';
import './Layout.scss';

export const Layout: React.FC = () => {
  return (
    <div className="app-layout">
      <aside className="sidebar glass-panel">
        <div className="sidebar-header">
          <div className="logo-icon">
            <Settings size={24} />
          </div>
          <h1 className="app-title">DevToolbox</h1>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            end
          >
            <Home size={20} />
            <span>Home</span>
          </NavLink>

          <NavLink
            to="/json-viewer"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <FileJson size={20} />
            <span>JSON Viewer</span>
          </NavLink>

          <NavLink
            to="/notes"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <FileText size={20} />
            <span>Notes Editor</span>
          </NavLink>

          {/*
          <NavLink
            to="/gdrive-downloader"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <FolderOpen size={20} />
            <span>GDrive Downloader</span>
          </NavLink>
          */}

          <NavLink
            to="/file-hasher"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Hash size={20} />
            <span>File Hasher</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <p>v1.0.0</p>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};
