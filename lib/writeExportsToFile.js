const fs = require("fs");

async function writeExportsToFile(to, customMedia, customProperties, exports) {
  const fileHeader = [
    "/*",
    " * This is a generated file for the development environment.",
    " * Do not edit directly.",
    " */",
  ].join("\n");

  const customPropertiesAsCss = getCustomPropertiesAsCss(
    customProperties,
    exports
  );

  const customMediaAsCss = getCustomMediaAsCss(customMedia);

  const css = `${fileHeader}\n\n${customMediaAsCss}\n${customPropertiesAsCss}`;

  await writeFile(to, css);
}

function getCustomPropertiesAsCss(customProperties, exports) {
  const rootCss = (values, indent = 0) => {
    let rules = "";
    const t1 = "\t".repeat(indent);
    const t2 = "\t".repeat(indent + 1);
    for (let [name, value] of Object.entries(values)) {
      rules += `${t2}${name}: ${value};\n`;
    }
    return `${t1}:root {\n${rules}${t1}}\n`;
  };
  let css = rootCss(customProperties);

  exports?.customProperties?.forEach((values, media) => {
    if (media !== "all") {
      css += `\n@media ${media} {\n${rootCss(
        Object.fromEntries(values),
        1
      )}}\n`;
    }
  });

  return css;
}

function getCustomMediaAsCss(customMedia) {
  const cssContent = Object.keys(customMedia)
    .reduce((cssLines, name) => {
      cssLines.push(`@custom-media ${name} ${customMedia[name]};`);

      return cssLines;
    }, [])
    .join("\n");
  return `${cssContent}\n`;
}

function writeFile(to, text) {
  return new Promise((resolve, reject) => {
    fs.writeFile(to, text, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

module.exports = writeExportsToFile;
