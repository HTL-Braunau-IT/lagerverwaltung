"use client";

import { signIn } from "next-auth/react";

export function MicrosoftSignInButton() {
  return (
    <button
      type="button"
      onClick={() => void signIn("azure-ad", { callbackUrl: "/" })}
      className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
    >
      Mit Microsoft anmelden
    </button>
  );
}
