// Bundles the ES-module source (js/) into single minified + obfuscated files in
// dist/. The deployed site serves ONLY dist/ + html/css/resources — never the
// readable js/ source. NOTE: client JS can never be made truly uncopyable; this
// only deters casual copying (DevTools can still inspect the running code).

const path = require("path");
const webpack = require("webpack");
const { execSync } = require("child_process");
const WebpackObfuscator = require("webpack-obfuscator");

// Build id shown in the UI so it's easy to tell which commit Vercel deployed.
let buildId = "dev";
try {
  const sha = execSync("git rev-parse --short HEAD").toString().trim();
  const date = new Date().toISOString().slice(0, 16).replace("T", " ");
  buildId = `${sha} · ${date}`;
} catch { /* not a git checkout */ }

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
    new webpack.DefinePlugin({ __BUILD_ID__: JSON.stringify(buildId) }),
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
