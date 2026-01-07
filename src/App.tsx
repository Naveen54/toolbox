import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { JsonViewer } from './pages/JsonViewer';
import { NotesEditor } from './pages/NotesEditor';
import { GoogleDriveDownloader } from './pages/GoogleDriveDownloader';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="json-viewer" element={<JsonViewer />} />
        <Route path="notes" element={<NotesEditor />} />
        <Route path="gdrive-downloader" element={<GoogleDriveDownloader />} />
      </Route>
    </Routes>
  );
}

export default App;
