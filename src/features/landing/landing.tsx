import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Demo } from "@/features/landing/demo"
import { SiteFooter, SiteHeader } from "@/features/landing/site-frame"

export const Landing = () => (
  <div className="flex h-svh min-h-[34rem] flex-col">
    <SiteHeader>
      <Button variant="ghost" render={<Link to="/jobs" />}>
        Jobs
      </Button>
      <Button variant="ghost" render={<Link to="/sign-in" />}>
        Sign in
      </Button>
    </SiteHeader>
    <main className="flex min-h-0 flex-1 flex-col gap-5 px-4 sm:gap-7 sm:px-8">
      <div className="flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between md:gap-12">
        <h1 className="font-heading text-[2rem]/9 font-semibold tracking-[-0.03em] lg:text-[2.75rem]/12">
          It finds the jobs and fills in the forms.
          <br />
          You press Submit.
        </h1>
        <div className="flex shrink-0 items-center gap-6">
          <p className="text-muted-foreground hidden w-56 text-sm lg:block">
            Works with Greenhouse, Lever, Ashby and Personio.
          </p>
          <Button size="lg" className="max-md:w-full" render={<Link to="/sign-in" />}>
            Get started
          </Button>
        </div>
      </div>
      <Demo />
    </main>
    <SiteFooter />
  </div>
)
