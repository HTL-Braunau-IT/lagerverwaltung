"use client";

import { signIn } from "next-auth/react";
import { Button } from "~/components/ui/button";

export function MicrosoftSignInButton() {
  return (
    <Button
      onClick={() => void signIn("azure-ad", { callbackUrl: "/" })}
      className="mt-6 h-11 w-full rounded-xl text-sm font-semibold"
    >
      Mit Microsoft anmelden
    </Button>
  );
}
