export const unmark = (markdown: string) =>
  markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}(#{1,6}|[-*+]|\d+\.|>)[ \t]+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, "$1")

/** `slice(0, length)` that leaves no half an emoji at the end. A string with one can't cross into
 * or out of a Convex function: the whole call fails. */
export const cut = (text: string, length: number) =>
  text.slice(0, length).replace(/[\uD800-\uDBFF]$/, "")
