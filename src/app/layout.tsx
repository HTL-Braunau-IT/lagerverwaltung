import "~/styles/globals.css";

import { type Metadata } from "next";
import Link from "next/link";
import { Manrope, Sora } from "next/font/google";

import { MicrosoftSignInButton } from "~/components/auth/microsoft-sign-in-button";
import { auth } from "~/server/auth";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Lagerverwaltung HTL",
  description: "Lagerverwaltung für die HTL",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
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
    <html lang="de" className={`${sora.variable} ${manrope.variable}`}>
      <body className="bg-slate-50 text-slate-900 antialiased">
        {session?.user ? (
          <TRPCReactProvider>
            <header className="border-b border-slate-200 bg-white">
              <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
                <p className="text-sm font-medium text-slate-700">
                  {`Angemeldet als ${session.user.email ?? "Benutzer"} (${roleLabels[session.user.role]})`}
                </p>
                <Link
                  href="/api/auth/signout"
                  className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Abmelden
                </Link>
              </div>
            </header>
            {children}
          </TRPCReactProvider>
        ) : (
          <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.22),transparent_42%),radial-gradient(circle_at_80%_80%,rgba(56,189,248,0.18),transparent_45%)]" />
            <section className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-[0_24px_70px_-30px_rgba(2,132,199,0.55)] backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-sky-700">HTL Lagerverwaltung</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Willkommen zur Materialausgabe</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
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
