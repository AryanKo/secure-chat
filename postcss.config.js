// This is the PostCSS configuration file.
// PostCSS is a tool that transforms CSS with JavaScript plugins.
// Tailwind CSS uses PostCSS to process its directives and optimize the CSS.

// Exports the configuration object using ES module syntax.
export default {
  plugins: {
    // The Tailwind CSS PostCSS plugin is referenced.
    // This tells PostCSS to run Tailwind CSS on the CSS files.
    'tailwindcss/nesting': {}, // Added for better compatibility with PostCSS nesting
    'tailwindcss': {}, // Using the main tailwindcss plugin directly
    // Autoprefixer is also included.
    // Autoprefixer automatically adds vendor prefixes (like -webkit-, -moz-)
    // to CSS rules, ensuring styles work across different browsers.
    autoprefixer: {},
  },
};
