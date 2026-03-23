import "~/styles/globals.css";

import { type Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";

import { MicrosoftSignInButton } from "~/components/auth/microsoft-sign-in-button";
import { auth } from "~/server/auth";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Lagerverwaltung HTL",
  description: "Lagerverwaltung für die HTL",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-custom",
});

const roleLabels: Record<"ADMIN" | "TEACHER" | "STUDENT", string> = {
  ADMIN: "Administrator",
  TEACHER: "Lehrkraft",
  STUDENT: "Schueler",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="de" className={inter.variable}>
      <body className="bg-background text-foreground antialiased">
        {session?.user ? (
          <TRPCReactProvider>
            <header
              data-app-shell-header="true"
              className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur"
            >
              <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
                <p className="text-sm font-medium text-muted-foreground">
                  {`Angemeldet als ${session.user.email ?? "Benutzer"} (${roleLabels[session.user.role]})`}
                </p>
                <div className="flex items-center gap-2">
                  <Link
                    href="/orders"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    Bestellhistorie
                  </Link>
                  {session.user.role === "ADMIN" ? (
                    <Link
                      href="/backend"
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Administration
                    </Link>
                  ) : null}
                  <Link
                    href="/api/auth/signout"
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
                  >
                    Abmelden
                  </Link>
                </div>
              </div>
            </header>
            {children}
          </TRPCReactProvider>
        ) : (
          <main className="flex min-h-screen items-center justify-center p-6">
            <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">HTL Lagerverwaltung</p>
              <h1 className="mt-2 text-3xl font-semibold text-foreground">Willkommen zur Materialausgabe</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Melde dich mit deinem Microsoft-Schulkonto an, um Produkte zu sehen und Bestellungen zu verwalten.
              </p>

              <MicrosoftSignInButton />
            </section>
          </main>
        )}
      </body>
    </html>
  );
}
