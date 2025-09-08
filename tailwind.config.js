/** @type {import('tailwindcss').Config} */
export const content = [
  "./index.html", // Scans the main HTML file in the project root.
  "./src/**/*.{js,ts,jsx,tsx}", // Scans all JavaScript, TypeScript, JSX, and TSX files in the 'src' folder and its subfolders.
];
export const theme = {
  // The 'extend' object allows extending Tailwind's default theme without overwriting it.
  // Custom colors, fonts, spacing, etc., can be added here.
  extend: {},
};
export const plugins = [];
