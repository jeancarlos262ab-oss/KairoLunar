import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import Visualizer3D from './visualizerLand.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Visualizer3D />
  </StrictMode>,
);