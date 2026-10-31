import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { SiteFooter, SiteHeader } from "@/features/landing/site-frame"

export const Landing = () => (
  <div className="flex min-h-svh flex-col">
    <SiteHeader>
      <Button variant="ghost" render={<Link to="/sign-in" />}>
        Sign in
      </Button>
    </SiteHeader>
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <h1 className="font-heading max-w-4xl text-5xl leading-[1.05] font-bold tracking-tight text-balance sm:text-7xl">
        You don't have to grind for jobs anymore.
      </h1>
      <div className="grid max-w-2xl gap-4 text-lg text-pretty">
        <p className="font-medium">Line up your next job while you still have this one.</p>
        <p className="text-muted-foreground">
          Job Tracking Helper finds open roles on Greenhouse, Lever, Ashby and Personio that fit
          what you asked for, gets each application ready and keeps track of what you sent. You
          check it and press Submit yourself.
        </p>
      </div>
      <div>
        <Button size="lg" render={<Link to="/sign-in" />}>
          Get started
        </Button>
      </div>
    </main>
    <SiteFooter />
  </div>
)
