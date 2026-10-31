import { SiteFooter, SiteHeader } from "@/features/landing/site-frame"
import { site } from "@/lib/seo"

export const LegalPage = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex min-h-svh flex-col">
    <SiteHeader />
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="font-heading text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">Last updated {site.updated}</p>
      <div className="mt-8 grid gap-8">{children}</div>
    </main>
    <SiteFooter />
  </div>
)

export const LegalSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="grid gap-3 leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5">
    <h2 className="font-heading text-xl font-semibold">{title}</h2>
    {children}
  </section>
)

export const ContactLink = () => <a href={`mailto:${site.contact}`}>{site.contact}</a>
