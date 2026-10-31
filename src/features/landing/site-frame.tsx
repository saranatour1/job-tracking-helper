import { Link } from "@tanstack/react-router"

import { site } from "@/lib/seo"

export const SiteHeader = ({ children }: { children?: React.ReactNode }) => (
  <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 p-6">
    <Link to="/" className="font-heading flex items-center gap-2.5 font-medium">
      <img src="/logo.svg" alt="" width={32} height={32} />
      {site.name}
    </Link>
    {children}
  </header>
)

const footerLink = "hover:text-foreground underline-offset-4 hover:underline"

export const SiteFooter = () => (
  <footer className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 p-6 text-sm">
    <p>
      © {new Date().getFullYear()} {site.author}
    </p>
    <nav aria-label="Legal and credits" className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Link to="/privacy" className={footerLink}>
        Privacy
      </Link>
      <Link to="/terms" className={footerLink}>
        Terms
      </Link>
      <a href="https://www.convex.dev" target="_blank" rel="noopener" className={footerLink}>
        Made with Convex
      </a>
    </nav>
  </footer>
)
