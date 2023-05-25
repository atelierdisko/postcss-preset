function generateCssFromGlobalData(globalData) {
  const customPropertiesAsCss = getCustomPropertiesAsCss(globalData);
  const customMediaAsCss = getCustomMediaAsCss(globalData);
  return `${customMediaAsCss}\n${customPropertiesAsCss}`;
}

function getCustomPropertiesAsCss({
  customProperties,
  responsiveCustomProperties,
}) {
  const rootCss = (values, indent = 0) => {
    if (!values) {
      return "";
    }
    let rules = "";
    const t1 = "\t".repeat(indent);
    const t2 = "\t".repeat(indent + 1);
    for (let [name, value] of Object.entries(values)) {
      rules += `${t2}${name}: ${value};\n`;
    }
    return `${t1}:root {\n${rules}${t1}}\n`;
  };

  let css = "";

  css += rootCss(customProperties);

  responsiveCustomProperties?.forEach?.((values, media) => {
    if (media !== "all") {
      css += `\n@media ${media} {\n${rootCss(
        Object.fromEntries(values),
        1
      )}}\n`;
    }
  });

  return css;
}

function getCustomMediaAsCss({ customMedia }) {
  let css = "";
  customMedia &&
    Object.entries(customMedia).forEach(([name, query]) => {
      if (name !== "all") {
        css += `@custom-media ${name} ${query};\n`;
      }
    });
  return `\n${css}`;
}

module.exports = generateCssFromGlobalData;
