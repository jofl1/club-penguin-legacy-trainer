/**
 * Apply a list of {find, replace} replacements to script content.
 * CRLF is normalised to LF before matching so the matcher is line-ending
 * agnostic across FFDec output variations (different JVMs, OS line endings).
 *
 * @param {string} rawContent - file content read from disk
 * @param {Array<{find: string, replace: string, anchor?: string}>} replacements
 * @returns {{modified: boolean, content: string, unmatched: Array<{replacement: object, content: string}>}}
 */
exports.applyReplacements = (rawContent, replacements) => {
  let content = rawContent.replace(/\r\n/g, "\n");
  let modified = false;
  const unmatched = [];

  for (const replacement of replacements) {
    if (content.includes(replacement.find)) {
      content = content.replace(replacement.find, replacement.replace);
      modified = true;
    } else {
      unmatched.push({ replacement, content });
    }
  }

  return { modified, content, unmatched };
};

/**
 * Build a human-readable diagnostic when a replacement fails to match.
 * Locates an anchor (replacement.anchor || first 40 chars of find) and
 * returns ±100 chars around it so the caller can log/inspect.
 *
 * @returns {{found: boolean, anchor: string, excerpt?: string}}
 */
exports.excerptAroundAnchor = (content, replacement) => {
  const anchor = replacement.anchor || replacement.find.slice(0, 40);
  const idx = content.indexOf(anchor);
  if (idx < 0) {
    return { found: false, anchor };
  }
  const start = Math.max(0, idx - 100);
  const end = Math.min(content.length, idx + anchor.length + 100);
  return { found: true, anchor, excerpt: content.slice(start, end) };
};
