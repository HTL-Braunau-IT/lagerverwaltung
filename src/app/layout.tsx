import "~/styles/globals.css";

import { type Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";

import { MicrosoftSignInButton } from "~/components/auth/microsoft-sign-in-button";
import {
  AdministrationIcon,
  ApprovalsIcon,
  LogoutIcon,
  OrdersIcon,
} from "~/components/layout/icon-renders";
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

type HeaderNavLinkProps = {
  href: string;
  label: string;
  hoverClassName: string;
  icon: React.ReactNode;
};

function HeaderNavLink({ href, label, hoverClassName, icon }: HeaderNavLinkProps) {
  return (
    <Link
      href={href}
      className={`group inline-flex min-w-24 flex-col items-center gap-1 text-muted-foreground transition-colors ${hoverClassName}`}
    >
      <span className="flex h-10 w-10 items-center justify-center">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="de" className={inter.variable}>
      <body className="bg-background text-foreground antialiased">
        {session?.user ? (
          <TRPCReactProvider session={session}>
            <header
              data-app-shell-header="true"
              className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur"
            >
              <div className="mx-auto grid w-full max-w-7xl grid-cols-[220px_1fr_auto] items-center gap-4 px-6 py-4">
                <Link
                  href="/"
                  className="flex flex-col items-center text-center text-foreground transition-colors hover:text-primary"
                >
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">HTL LAGER</span>
                  <span className="text-xl font-semibold">Schulshop</span>
                </Link>
                <p className="text-center text-sm font-medium text-muted-foreground">
                  {`Angemeldet als ${session.user.email ?? "Benutzer"} (${roleLabels[session.user.role]})`}
                </p>
                <div className="flex items-center gap-3">
                  <HeaderNavLink
                    href="/orders"
                    label="Bestellhistorie"
                    hoverClassName="hover:text-sky-600"
                    icon={<OrdersIcon />}
                  />
                  {session.user.role === "ADMIN" || session.user.role === "TEACHER" ? (
                    <HeaderNavLink
                      href="/teacher/orders"
                      label="Freigaben"
                      hoverClassName="hover:text-emerald-600"
                      icon={<ApprovalsIcon />}
                    />
                  ) : null}
                  {session.user.role === "ADMIN" ? (
                    <HeaderNavLink
                      href="/backend"
                      label="Administration"
                      hoverClassName="hover:text-violet-600"
                      icon={<AdministrationIcon />}
                    />
                  ) : null}
                  <HeaderNavLink
                    href="/api/auth/signout"
                    label="Abmelden"
                    hoverClassName="hover:text-rose-600"
                    icon={<LogoutIcon />}
                  />
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
