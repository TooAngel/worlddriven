module.exports = {
  mode: 'development',
  entry: './src/public/js/script.js',
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [
          'style-loader',
          {
            loader: 'css-loader', // generating unique classname
            options: {
              importLoaders: 1, // if specifying more loaders
              sourceMap: false,
              modules: {
                localIdentName: '[path]___[name]__[local]___[hash:base64:5]', // babel-plugin-css-module format
                // localIdentName: "[path][name]__[local]" //recommended settings by cssloader#local-scope , this option generate unique classname for compiled css
              },
            },
          },
        ],
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
    ],
  },
};
