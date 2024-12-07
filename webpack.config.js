const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
const packageJson = require("./package.json");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";
  return {
    target: "node",
    mode: isProduction ? "production" : "development",
    devtool: isProduction ? false : "source-map",
    entry: {
      main: "./src/main.ts",
    },
    output: {
      libraryTarget: "commonjs2",
      libraryExport: "default",
      path: path.resolve(__dirname, "./dist"),
      filename: "MSGG-GoalTracker.js",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".js", ".html"],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: [
            {
              loader: "ts-loader",
              options: {
                transpileOnly: !isProduction, // Faster builds in development
              },
            },
          ],
          exclude: /node_modules/,
        },
        {
          test: /\.html$/i,
          loader: 'raw-loader',
        }
      ],
    },
    optimization: {
      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            keep_fnames: /main/,
            mangle: false,
            format: {
              comments: false,
            },
            compress: {
              dead_code: true,
              unused: true,
            },
          },
          extractComments: false,
        }),
      ],
    },
    performance: {
      hints: false,
    },
    stats: {
      modules: false,
      children: false,
    }
  };
};