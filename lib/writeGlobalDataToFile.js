const fs = require("fs");
const generateCssFromGlobalData = require("./generateCssFromGlobalData");

async function writeGlobalDataToFile(to, globalData) {
  const fileHeader = [
    "/*",
    " * This is a generated file for the development environment.",
    " * Do not edit directly.",
    " */",
  ].join("\n");

  const fromData = generateCssFromGlobalData(globalData);

  const css = `${fileHeader}\n\n${fromData}`;

  await writeFile(to, css);
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

module.exports = writeGlobalDataToFile;
