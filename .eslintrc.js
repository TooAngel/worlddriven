module.exports = {
  "ignorePatterns": ["tmp/", "node_modules/", "dist/"],
  "extends": [
    "google",
    "plugin:react/recommended",
  ],
  "parserOptions": {
    "ecmaVersion": 2020,
    "ecmaFeatures": {
      "jsx": true
    },
    "sourceType": "module",
  },
  "plugins": [
    "react"
  ],
  "env": {
    "mocha": true
  },
  "rules": {
    "max-len": [2, 600],
    "prefer-const": "error",
    "eqeqeq": ["error", "always"],
    "no-unused-vars": [
      "error",
      {
        "varsIgnorePattern": "should|expect|assert"
      }
    ],
    "indent": ["error", 2]
  },
  "settings": {
    "react": {
      "version": "detect",
    }
  },
};
