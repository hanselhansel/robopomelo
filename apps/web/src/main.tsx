import { createRoot } from 'react-dom/client';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-serif-4/600.css';
import { App } from './App.js';
import './styles.css';
const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');
createRoot(root).render(<App />);
