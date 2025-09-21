// In functions/.eslintrc.js

module.exports = {
  root: true,
  env: {
    es6: true,
    node: true, // This line fixes the 'module', 'require', and 'exports' errors
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    quotes: ["error", "double"],
  },
};