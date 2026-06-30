// Bundles the ES-module source (js/) into single minified + obfuscated files in
// dist/. The deployed site serves ONLY dist/ + html/css/resources — never the
// readable js/ source. NOTE: client JS can never be made truly uncopyable; this
// only deters casual copying (DevTools can still inspect the running code).

const path = require("path");
const WebpackObfuscator = require("webpack-obfuscator");

module.exports = {
  mode: "production",
  devtool: false, // no source maps shipped
  entry: {
    editor: "./js/editor.js",
    importer: "./js/importer.js",
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
  optimization: { minimize: true },
  plugins: [
    new WebpackObfuscator(
      {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.2,
        numbersToExpressions: true,
        simplify: true,
        stringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: 0.75,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        splitStrings: true,
        splitStringsChunkLength: 8,
        selfDefending: true,
        transformObjectKeys: true,
        disableConsoleOutput: true,
        // debugProtection left OFF — it can freeze the page on some browsers.
      },
      [] // exclude list (none)
    ),
  ],
};
