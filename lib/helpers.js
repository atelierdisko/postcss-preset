const path = require("path");

// From lodash: https://github.com/lodash/lodash

const objectConstructorString = Function.prototype.toString.call(Object);
const symToStringTag = Symbol ? Symbol.toStringTag : undefined;
const undefinedTag = "[object Undefined]",
  nullTag = "[object Null]",
  objectTag = "[object Object]";

function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  if (symToStringTag && symToStringTag in Object(value)) {
    const isOwn = Object.prototype.hasOwnProperty.call(value, symToStringTag),
      tag = value[symToStringTag];
    let unmasked;

    try {
      value[symToStringTag] = undefined;
      unmasked = true;
    } catch (e) {}

    const result = Object.prototype.toString.call(value);
    if (unmasked) {
      if (isOwn) {
        value[symToStringTag] = tag;
      } else {
        delete value[symToStringTag];
      }
    }
    return result;
  } else {
    return Object.prototype.toString.call(value);
  }
}

function isPlainObject(value) {
  if (
    !(value != null && typeof value == "object") ||
    baseGetTag(value) !== objectTag
  ) {
    return false;
  }
  const proto = Object.getPrototypeOf(Object(value));
  if (proto === null) {
    return true;
  }
  const constructor =
    Object.prototype.hasOwnProperty.call(proto, "constructor") &&
    proto.constructor;
  return (
    typeof constructor == "function" &&
    constructor instanceof constructor &&
    Function.prototype.toString.call(constructor) === objectConstructorString
  );
}

function resolvePath(filePath) {
  if (filePath.startsWith("node_modules://")) {
    try {
      return require.resolve(filePath.slice(15), {
        paths: [path.dirname(filePath)],
      });
    } catch (e) {
      throw new Error(`Failed to read ${filePath} with error ${e.message}`);
    }
  } else {
    return path.resolve(filePath);
  }
}

module.exports = { isPlainObject, resolvePath };
