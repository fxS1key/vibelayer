import { createRoot } from 'react-dom/client';
import { App } from '../panel/App.js';
import '../panel/styles.css';

const root = document.getElementById('root');
if (root) createRoot(root).render(<App mode="popup" />);
