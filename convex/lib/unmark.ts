export const unmark = (markdown: string) =>
  markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}(#{1,6}|[-*+]|\d+\.|>)[ \t]+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, "$1")
