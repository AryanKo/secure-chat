// This file is the entry point for the React application.

// Imports the StrictMode component from React, which helps identify potential problems in an application.
import { StrictMode } from 'react';
// Imports createRoot from react-dom/client to enable concurrent mode features for rendering.
import { createRoot } from 'react-dom/client';

// Imports the global CSS file. This file will also import Tailwind CSS.
import './index.css';

// Imports the main App component of the application.
import App from './app.jsx';

createRoot(document.getElementById('root')).render(
  // StrictMode activates additional checks and warnings for its descendants.
  <StrictMode>
    {/* The main App component is rendered here. */}
    <App />
  </StrictMode>,
);
