import { createFileRoute, redirect } from "@tanstack/react-router"

import { SignIn } from "@/features/auth/sign-in"

export const Route = createFileRoute("/_auth/sign-up")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: "/sign-in" })
  },
  component: () => <SignIn key="signUp" mode="signUp" />,
})
