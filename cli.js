#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const glob = require("glob");
const postcss = require("postcss");
const postcssLoadConfig = require("postcss-load-config");
const { default: DtsCreator } = require("typed-css-modules");

async function run() {
  const { default: ora } = await import("ora");
  let spinner;
  if (process.stdout.isTTY) {
    spinner = ora({
      text: undefined,
      prefixText: "Genrate CSS module types",
      spinner: {
        frames: [".", "..", "..."],
        interval: 200,
      },
      stream: process.stdout,
    }).start();
  } else {
    console.log("Genrate CSS module types...");
  }

  await glob(
    "**/*.module.css.d.ts",
    { ignore: "node_modules/**" },
    async (err, files) => {
      await Promise.all(
        files.map(async (file) => {
          await fs.promises.rm(file);
        })
      );
    }
  );

  await glob(
    "**/*.module.css",
    { ignore: "node_modules/**" },
    async (err, files) => {
      const { plugins, options } = await postcssLoadConfig();
      const creator = new DtsCreator();
      await Promise.all(
        files.map(async (file) => {
          const css = await fs.promises.readFile(file, "utf-8");
          if (css.trim()) {
            const result = await postcss(plugins).process(css, {
              ...options,
              from: file,
            });
            creator.create(file, result.css).then((content) => {
              content.writeFile().then((r) => {});
            });
          }
        })
      );
      spinner?.stopAndPersist();
    }
  );
}

run().then(() => {});
