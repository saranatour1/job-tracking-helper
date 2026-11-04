/** Where to go after signing in, from `?redirect=`: only a path on this site, so a link can't send
 * someone elsewhere. */
export const redirectSearch = (search: Record<string, unknown>): { redirect?: string } => ({
  redirect:
    typeof search.redirect === "string" &&
    /^\/(?![/\\])/.test(search.redirect) &&
    !/[\\\s]/.test(search.redirect)
      ? search.redirect
      : undefined,
})
