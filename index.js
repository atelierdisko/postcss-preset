"use strict";

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const { parse } = require("postcss");
const { vanillaExtractPlugin } = require("@vanilla-extract/esbuild-plugin");
const extractFromCss = require("./lib/extractFromCss.js");
const writeExportsToFile = require("./lib/writeExportsToFile");
const { isPlainObject } = require("./lib/helpers");
const logErrorFromSourceMap = require("./lib/logErrorFromSourceMap");
const { default: DtsCreator } = require("typed-css-modules");

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

  if (
    source.hasOwnProperty("exports") &&
    source.exports.hasOwnProperty("customProperties")
  ) {
    target.exports ??= { customProperties: new Map() };
    source.exports.customProperties.forEach((rules, media) => {
      let currentMedia;
      if (target.exports.customProperties.has(media)) {
        currentMedia = target.exports.customProperties.get(media);
      } else {
        currentMedia = new Map();
        target.exports.customProperties.set(media, currentMedia);
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
      mergeImports(imports, exported);
    }
  }

  return { imports, css };
}

function fileExists(filepath) {
  return new Promise((resolve) => {
    fs.access(filepath, fs.constants.F_OK, (error) => {
      resolve(!error);
    });
  });
}

const internalPlugin = () => {
  return {
    postcssPlugin: "postcss-preset-internal-dts",
    prepare() {
      let creator = new DtsCreator();
      return {
        OnceExit: async function (root, { result }) {
          const { file } = root.source.input;
          if (file.match(/\.module\.css$/)) {
            const css = result.root.toString();
            if (css.trim()) {
              creator.create(file, css).then((content) => {
                content.writeFile().catch((err) => console.error(err));
              });
            } else {
              // Remove d.ts file when empty
              const name = `${file}.d.ts`;
              if (await fileExists(name)) {
                await fs.promises.rm(name);
              }
            }
          }
        },
      };
    },
  };
};

internalPlugin.postcss = true;

const postcssPlugin = (options = {}) => {
  options = {
    postcssNormalize: {},
    postcssExtendRule: {},
    presetEnv: {},
    importFromModules: [],
    emitDeclaration: false,
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
    let css = "";
    for (const path of paths) {
      const fromModule = await importFromModule(path);
      mergeImports(imports, fromModule.imports);
      css += "\n";
      css += fromModule.css;
    }
    return imports;
  });

  return {
    postcssPlugin: "@atelierdisko/postcss-preset",
    plugins: [
      require("postcss-import")(options),
      require("postcss-normalize")(options.postcssNormalize),
      require("postcss-extend-rule")(options.postcssExtendRule),
      ...require("postcss-preset-env")({
        stage: 3,
        features: {
          "custom-properties": {
            preserve: true,
            disableDeprecationNotice: true,
            importFrom,
          },
          "custom-media-queries": {
            preserve: false,
            importFrom,
          },
          "nesting-rules": true,
        },

        exportTo: async ({ customMedia, customProperties }) => {
          if (process.env.NODE_ENV === "development") {
            const { exports } = await importFrom();
            for (const path of options.exportTo) {
              await writeExportsToFile(
                path,
                customMedia,
                customProperties,
                exports
              );
            }
            return [];
          }
        },
      }).plugins,
      ...(options.emitDeclaration ? [internalPlugin(options)] : []),
    ],
  };
};

postcssPlugin.postcss = true;

module.exports = postcssPlugin;
