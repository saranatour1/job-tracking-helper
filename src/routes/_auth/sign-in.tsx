import { createFileRoute } from "@tanstack/react-router"

import { redirectSearch } from "@/features/auth/redirect"
import { SignIn } from "@/features/auth/sign-in"

export const Route = createFileRoute("/_auth/sign-in")({
  validateSearch: redirectSearch,
  component: () => <SignIn key="signIn" mode="signIn" />,
})
