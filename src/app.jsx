// Imports the React library.
import React from 'react';

// Imports the user and lock icons from the assets folder.
import userIcon from './assets/user-icon.png';
import lockIcon from './assets/lock-icon.png';

// The main App component is defined.
function App() {
  return (
    // The main container for the application.
    // Sets full screen height, uses flexbox for vertical alignment, and applies a gradient background.
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 text-white flex flex-col">
      {/* Top navigation bar.
          Uses a semi-transparent dark background for a sleek look that complements the title.
          Paddings are applied for spacing, and flexbox is used to center content horizontally. */}
      <div className="w-full bg-gray-800 bg-opacity-70 py-4 px-6 flex justify-center items-center shadow-lg">
        {/* The main title of the application, now centered within the top bar. */}
        <h1 className="title text-white mb-0">CampusConnect</h1> {/* Removed mb-10 from here, handled by input.css */}
      </div>

      {/* Main content area, centered vertically and horizontally. */}
      <div className="flex-1 flex items-center justify-center p-4">
        {/* The login box container. */}
        <div className="login-box">
          {/* Input wrapper for the username field. */}
          <div className="input-wrapper">
            {/* User icon is displayed next to the username input. */}
            <img src={userIcon} alt="User Icon" className="input-icon" />
            {/* Username input field. */}
            <input type="text" placeholder="Username" />
          </div>

          {/* Input wrapper for the password field. */}
          <div className="input-wrapper">
            {/* Lock icon is displayed next to the password input. */}
            <img src={lockIcon} alt="Lock Icon" className="input-icon" />
            {/* Password input field. */}
            <input type="password" placeholder="Password" />
          </div>

          {/* Button wrapper for login and create account buttons. */}
          <div className="button-wrapper">
            {/* Login button. */}
            <button type="button">Login</button>
            {/* Create Account button. */}
            <button type="button">Create Account</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Exports the App component as the default export.
export default App;
