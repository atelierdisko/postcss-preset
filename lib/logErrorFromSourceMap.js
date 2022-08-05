const path = require("path");
const { SourceMapConsumer } = require("source-map");

function logErrorFromSourceMap(err, src, meta) {
  let {
    groups: { line, column },
  } = err.stack.match(/^\s*at .*?:((?<line>\d+)?:)?(?<column>\d+)/m) ?? {};
  line = parseInt(line, 10);
  column = parseInt(column, 10);

  const [_, mapFileName] = src.match(/\/\/# sourceMappingURL=(\S*)/) ?? [];

  const rawSourceMap = meta.outputFiles.find(
    ({ path: filePath }) => filePath === path.join(meta.sourceRoot, mapFileName)
  )?.text;

  SourceMapConsumer.with(rawSourceMap, null, (consumer) => {
    const original = consumer.originalPositionFor({
      line,
      column,
    });

    const source = path.relative(
      meta.absWorkingDir,
      path.join(meta.sourceRoot, original.source)
    );

    const sourceLine = consumer
      .sourceContentFor(original.source)
      .split(/\r?\n/)[original.line - 1];

    console.error(
      `\n${source}:${original.line}:${original.column}: \x1b[31m${err.name}:\x1b[0m ${err.message}\n` +
        `\x1b[2m${original.line} \u2502\x1b[0m  ${sourceLine}\n`
    );
  });
}

module.exports = logErrorFromSourceMap;
