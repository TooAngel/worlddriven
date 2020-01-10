const path = require('path');

module.exports = {
  // mode: 'production',
  mode: 'development',
  entry: './tmp/public/js/script.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
  },
};
