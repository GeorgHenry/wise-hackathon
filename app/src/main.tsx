// Styles first: tokens and base rules, so each component's own CSS (imported
// through App) comes later and can refine them.
import '@fontsource-variable/inter';
// Stands in for Wise Sans, Wise's proprietary display face: headlines and big amounts.
import '@fontsource-variable/schibsted-grotesk';
import './styles/tokens.css';
import './styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
