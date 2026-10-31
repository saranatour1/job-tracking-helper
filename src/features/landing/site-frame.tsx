import { Link } from "@tanstack/react-router"

import { ThemeButton } from "@/features/shell/theme"
import { site } from "@/lib/seo"

export const SiteHeader = ({ children }: { children?: React.ReactNode }) => (
  <header className="flex h-14 shrink-0 items-center justify-between gap-4 px-4 sm:h-15 sm:px-8">
    <Link to="/" className="font-heading flex items-center gap-2 font-semibold tracking-tight">
      <img src="/logo.svg" alt="" width={26} height={26} />
      {site.name}
    </Link>
    <div className="flex items-center gap-1">
      <ThemeButton />
      {children}
    </div>
  </header>
)

const footerLink = "hover:text-foreground underline-offset-4 hover:underline"

export const SiteFooter = () => (
  <footer className="text-muted-foreground flex h-13 shrink-0 items-center justify-between gap-4 px-4 text-[13px] sm:px-8">
    <nav aria-label="Legal" className="flex items-center gap-5">
      <Link to="/privacy" className={footerLink}>
        Privacy
      </Link>
      <Link to="/terms" className={footerLink}>
        Terms
      </Link>
    </nav>
    <a
      href="https://www.convex.dev"
      target="_blank"
      rel="noopener"
      className="hover:text-foreground flex items-center gap-1.5"
    >
      Built on
      <img src="/convex.svg" alt="Convex" width={70} height={15} className="dark:hidden" />
      <img
        src="/convex-dark.svg"
        alt="Convex"
        width={70}
        height={15}
        className="hidden dark:block"
      />
    </a>
  </footer>
)
