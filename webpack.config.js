const path = require('path');

module.exports = {
  entry: './static/script.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: [
      {
        test: /static/\.css$/,
        use: [ 'style-loader', 'css-loader' ]
      }
    ]
  }
};
