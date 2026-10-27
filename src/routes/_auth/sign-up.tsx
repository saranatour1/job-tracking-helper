import { createFileRoute } from "@tanstack/react-router"

import { SignIn } from "@/features/auth/sign-in"

export const Route = createFileRoute("/_auth/sign-up")({
  component: () => <SignIn key="signUp" mode="signUp" />,
})
