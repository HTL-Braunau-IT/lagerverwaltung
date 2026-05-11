"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => {
        void (async () => {
          await signOut({ redirect: false });
          window.location.href = "/api/auth/microsoft-logout?returnTo=/";
        })();
      }}
      className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors bg-destructive text-card"
    >
      Abmelden
    </button>
  );
}
