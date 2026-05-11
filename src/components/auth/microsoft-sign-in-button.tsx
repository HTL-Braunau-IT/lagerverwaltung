"use client";

import { signIn } from "next-auth/react";
import { Button } from "~/components/ui/button";

export function MicrosoftSignInButton() {
  return (
    <Button
      variant="solid"
      className="gap-2"
      onClick={() => void signIn("azure-ad", { callbackUrl: "/" })}
    >
      <img
        src="/icons/microsoft-icon.png"
        width={16}
        height={16}
        alt="Microsoft"
        className="h-4 w-4 transition"
      />
      Mit Microsoft anmelden
    </Button>
  );
}
