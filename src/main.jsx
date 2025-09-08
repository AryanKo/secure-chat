// This file is the entry point for the React application.

// Imports the StrictMode component from React, which helps identify potential problems in an application.
import { StrictMode } from 'react';
// Imports createRoot from react-dom/client to enable concurrent mode features for rendering.
import { createRoot } from 'react-dom/client';

// Imports the global CSS file. This file will also import Tailwind CSS.
import './index.css';

// Imports the main App component of the application.
import App from './App.jsx';

// Finds the HTML element with the ID 'root' in index.html.
// This is where the React application will be mounted.
createRoot(document.getElementById('root')).render(
  // StrictMode activates additional checks and warnings for its descendants.
  // It helps in writing better React code by highlighting potential issues.
  <StrictMode>
    {/* The main App component is rendered here. */}
    <App />
  </StrictMode>,
);
