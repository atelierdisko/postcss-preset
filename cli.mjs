#!/usr/bin/env node

import postcssLoadConfig from "postcss-load-config"
import postcss from "postcss"

import {run, parseArgv} from "happy-css-modules";


const main = async () => {
    const {plugins, options} = await postcssLoadConfig();
    await postcss(plugins).process("", {
        ...options,
        from: undefined,
    });

    run({
        ...parseArgv(process.argv.concat("**/*.module.css")),
        localsConvention: "camelCaseOnly",
        arbitraryExtensions: true,
        postcssConfig: "./postcss.config.js",
        cache: false,
        cwd: process.cwd(),
    })
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
};

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
