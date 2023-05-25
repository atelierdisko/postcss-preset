// From https://github.com/csstools/postcss-plugins/blob/main/plugins/postcss-custom-media

const valueParser = require("postcss-value-parser");
const mediaASTFromString = require("./mediaAstFromString");

function getCustomMediasFromRoot(root, opts) {
  const customMedias = {};

  // for each custom selector atrule that is a child of the css root
  root.nodes.slice().forEach((node) => {
    if (node.type !== "atrule") {
      return;
    }

    if (node.name.toLowerCase() !== "custom-media") {
      return;
    }

    let paramsAst = null;
    try {
      paramsAst = valueParser(node.params);
    } catch (_) {
      return;
    }

    if (!paramsAst || !paramsAst.nodes || !paramsAst.nodes.length) {
      return;
    }

    let nameNodeIndex = -1;
    for (let i = 0; i < paramsAst.nodes.length; i++) {
      const node = paramsAst.nodes[i];
      if (node.type === "space" || node.type === "comment") {
        continue;
      }

      if (node.type === "word" && node.value.startsWith("--")) {
        nameNodeIndex = i;
        break;
      }

      return; /* invalid starting node */
    }

    if (nameNodeIndex < 0) {
      return;
    }

    const name = paramsAst.nodes[nameNodeIndex].value.trim();
    const selectors = valueParser
      .stringify(paramsAst.nodes.slice(nameNodeIndex + 1))
      .trim();

    // write the parsed selectors to the custom selector
    customMedias[name] = mediaASTFromString(selectors);

    // conditionally remove the custom selector atrule
    if (!Object(opts).preserve) {
      node.remove();
    }
  });

  return customMedias;
}

// match html and :root rules
const htmlSelectorRegExp = /^html$/i;
const rootSelectorRegExp = /^:root$/i;

// whether the node is an html or :root rule
const isHtmlRule = (node) =>
  node.type === "rule" &&
  node.selector.split(",").some((item) => htmlSelectorRegExp.test(item)) &&
  Object(node.nodes).length;
const isRootRule = (node) =>
  node.type === "rule" &&
  node.selector.split(",").some((item) => rootSelectorRegExp.test(item)) &&
  Object(node.nodes).length;

// whether the node is a parent without children
const isEmptyParent = (node) => Object(node.nodes).length === 0;

function isBlockIgnored(ruleOrDeclaration) {
  const rule = ruleOrDeclaration.selector
    ? ruleOrDeclaration
    : ruleOrDeclaration.parent;

  return /(!\s*)?postcss-custom-properties:\s*off\b/i.test(rule.toString());
}

function getCustomPropertiesFromRoot(root, opts) {
  const getNext = (root, opts, out = new Map(), media = "all") => {
    // initialize custom selectors
    const customPropertiesFromHtmlElement = new Map();
    const customPropertiesFromRootPseudo = new Map();

    // for each html or :root rule
    root.nodes.slice().forEach((node) => {
      const customPropertiesObject = isHtmlRule(node)
        ? customPropertiesFromHtmlElement
        : isRootRule(node)
        ? customPropertiesFromRootPseudo
        : null;

      // for each custom property
      if (customPropertiesObject) {
        node.nodes.slice().forEach((decl) => {
          if (decl.variable && !isBlockIgnored(decl)) {
            const { prop } = decl;

            // write the parsed value to the custom property
            customPropertiesObject.set(prop, valueParser(decl.value));

            // conditionally remove the custom property declaration
            if (!opts.preserve) {
              decl.remove();
            }
          }
        });

        // conditionally remove the empty html or :root rule
        if (!opts.preserve && isEmptyParent(node) && !isBlockIgnored(node)) {
          node.remove();
        }
      } else if (node.type === "atrule" && node.name === "media") {
        getNext(node, opts, out, node.params);
      }
    });

    let currentMedia;
    const customProperties = [
      ...customPropertiesFromHtmlElement.entries(),
      ...customPropertiesFromRootPseudo.entries(),
    ];

    if (out.has(media)) {
      currentMedia = out.get(media);
    } else if (customProperties.length > 0) {
      currentMedia = new Map();
      out.set(media, currentMedia);
    }

    for (const [name, value] of customProperties) {
      currentMedia.set(name, value);
    }

    return out;
  };

  return getNext(root, opts);
}

module.exports = (root, opts) => {
  const customMedia = getCustomMediasFromRoot(root, opts);
  const responsiveCustomProperties = getCustomPropertiesFromRoot(root, opts);
  const customProperties = Object.fromEntries(
    responsiveCustomProperties.get("all")
  );

  return {
    customMedia,
    customProperties,
    responsiveCustomProperties,
  };
};
