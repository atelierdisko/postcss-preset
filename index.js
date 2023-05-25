"use strict";

const path = require("path");
const esbuild = require("esbuild");
const { parse } = require("postcss");
const { vanillaExtractPlugin } = require("@vanilla-extract/esbuild-plugin");
const extractFromCss = require("./lib/extractFromCss.js");
const writeExportsToFile = require("./lib/writeGlobalDataToFile");
const { isPlainObject, resolvePath } = require("./lib/helpers");
const logErrorFromSourceMap = require("./lib/logErrorFromSourceMap");
const generateCssFromGlobalData = require("./lib/generateCssFromGlobalData");

const cwd = process.cwd();

function mergeImports(target, source) {
  const keys = [
    "customMedia",
    "customProperties",
    "customSelectors",
    "environmentVariables",
  ];

  if (source == null || typeof source != "object") {
    return target;
  }

  for (const key of keys) {
    if (source.hasOwnProperty(key) && isPlainObject(source[key])) {
      target[key] ??= {};
      Object.assign(target[key], source[key]);
    }
  }

  if (source.hasOwnProperty("responsiveCustomProperties")) {
    target.responsiveCustomProperties ??= new Map();
    source.responsiveCustomProperties.forEach((rules, media) => {
      let currentMedia;
      if (target.responsiveCustomProperties.has(media)) {
        currentMedia = target.responsiveCustomProperties.get(media);
      } else {
        currentMedia = new Map();
        target.responsiveCustomProperties.set(media, currentMedia);
      }
      rules.forEach((rule, key) => {
        currentMedia.set(key, rule);
      });
    });
  }

  return target;
}

// Create module from String and require the export
function requireFromString(src, filename, meta) {
  // noinspection JSPotentiallyInvalidConstructorUsage
  const mdl = new module.constructor();
  mdl.paths = module.paths;
  try {
    // noinspection JSUnresolvedFunction
    mdl._compile(src, filename);
  } catch (err) {
    logErrorFromSourceMap(err, src, meta);
  }
  return mdl.exports;
}

async function importFromModule(inputFile) {
  const outdir = path.dirname(inputFile);
  let result = await esbuild.build({
    entryPoints: [inputFile],
    format: "cjs",
    bundle: true,
    write: false,
    plugins: [vanillaExtractPlugin()],
    external: ["*.woff", "*.woff2"],
    platform: "node",
    outdir,
    tsconfig: path.join(__dirname, "postcss-preset-tsconfig.json"),
    sourcemap: "linked",
    absWorkingDir: cwd,
  });
  const imports = {};
  let css = "";
  for (const file of result.outputFiles) {
    if (!file.text) {
      continue;
    }
    if (file.path.match(/\.css$/)) {
      css += "\n";
      css += file.text;

      const root = parse(file.text, { from: file.path });
      const exported = extractFromCss(root, { preserve: false });
      mergeImports(imports, exported);
    }
    if (file.path.match(/\.js$/)) {
      const exported = await requireFromString(
        file.text,
        file.path,
        Object.assign(
          { sourceRoot: path.join(cwd, outdir), absWorkingDir: cwd },
          result
        )
      );
      css += generateCssFromGlobalData(exported);
      mergeImports(imports, exported);
    }
  }

  return { imports, css };
}

const postcssPlugin = (options = {}) => {
  options = {
    postcssExtendRule: {},
    presetEnv: {},
    importFromModules: [],
    exportTo: [],
    ...options,
  };

  const useResolved = (fn) => {
    const result = { current: null };
    return () => {
      if (result.current === null) {
        result.current = fn();
      }
      return result.current;
    };
  };

  const importFrom = useResolved(async () => {
    const paths = options.importFromModules;
    const imports = {};
    let cssFiles = new Map();
    for (const filePath of paths) {
      const fromModule = await importFromModule(filePath);
      mergeImports(imports, fromModule.imports);
      cssFiles.set(filePath, fromModule.css);
    }
    return { imports, cssFiles };
  });

  const internalPlugin = () => {
    return {
      postcssPlugin: "@atelierdisko/postcss-preset-internal",
      prepare() {
        let importedFiles = new Set();
        let importedCSSNodes = new Set();

        return {
          Once: async (root, postcssHelpers) => {
            const { cssFiles } = await importFrom();

            for (let [filePath, css] of cssFiles) {
              const resolvedPath = resolvePath(filePath);

              if (importedFiles.has(resolvedPath)) {
                continue;
              }

              importedFiles.add(resolvedPath);

              postcssHelpers.result.messages.push({
                type: "dependency",
                plugin: "postcss-global-data",
                file: resolvedPath,
                parent: root.source?.input?.file,
              });

              const parsed = postcssHelpers.postcss.parse(css, {
                from: resolvedPath,
              });

              parsed?.each?.((node) => {
                root.append(node);
                importedCSSNodes.add(node);
              });
            }

            if (process.env.NODE_ENV === "development") {
              const { imports } = await importFrom();
              for (const path of options.exportTo) {
                await writeExportsToFile(path, imports);
              }
              return [];
            }
          },
          OnceExit: async () => {
            importedCSSNodes.forEach((node) => {
              node.remove();
            });
            importedCSSNodes = new Set();
            importedFiles = new Set();
          },
        };
      },
    };
  };

  internalPlugin.postcss = true;

  return {
    postcssPlugin: "@atelierdisko/postcss-preset",
    plugins: [
      internalPlugin(options),
      require("postcss-import")(options),
      ...require("postcss-preset-env")({
        stage: 3,
        features: {
          "custom-properties": {
            preserve: false,
          },
          "custom-media-queries": {
            preserve: false,
          },
          "nesting-rules": true,
        },
      }).plugins,
    ],
  };
};

postcssPlugin.postcss = true;

module.exports = postcssPlugin;
