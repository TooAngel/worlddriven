export default {
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
            presets: [['@babel/preset-env', {targets: {node: '16.3.1'}}], '@babel/preset-react'],
          },
        },
      },
    ],
  },
};
