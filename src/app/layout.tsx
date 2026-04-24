import "~/styles/globals.css";

import { type Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";

import { MicrosoftSignInButton } from "~/components/auth/microsoft-sign-in-button";
import { HeaderCartLink } from "~/components/layout/header-cart-link";
import { HeaderNavLink } from "~/components/layout/header-nav-link";
import { Search } from "~/components/layout/search";
import {
  AdministrationIcon,
  ApprovalsIcon,
  CartIcon,
  LendingIcon,
  OrdersIcon,
} from "~/components/layout/icon-renders";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
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
  const canSeeApprovals = session?.user.role === "ADMIN" || session?.user.role === "TEACHER";
  const assignedRequestsWhere =
    session?.user.role === "ADMIN"
      ? { status: "PENDING" as const }
      : {
          status: "PENDING" as const,
          OR: [
            { teacherUserId: session?.user.id ?? "" },
            ...(session?.user.azureAdObjectId
              ? [{ teacherExternalId: session.user.azureAdObjectId }]
              : []),
          ],
        };
  const openApprovalsCount = canSeeApprovals
    ? await db.orderRequest.count({
        where: assignedRequestsWhere,
      })
    : 0;
  const openApprovalsLabel = openApprovalsCount > 99 ? "99+" : String(openApprovalsCount);

  return (
    <html lang="de" className={inter.variable}>
      <body className="bg-background text-foreground antialiased">
        {session?.user ? (
          <TRPCReactProvider session={session}>
            <header
              data-app-shell-header="true"
              className="sticky top-5 z-50 mx-auto w-[calc(90%-2rem)] overflow-visible glass sm:w-[calc(90%-3rem)] lg:w-[calc(90%-4rem)]"
            >
              <div className="grid w-full grid-cols-[max-content_minmax(0,1fr)_auto] items-center gap-4 py-2 px-6">
                <Link
                  href="/"
                  prefetch={false}
                  className="flex flex-col items-center text-center text-foreground transition-colors hover:text-primary"
                >
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">HTL LAGER</span>
                  <span className="text-xl font-semibold">Schulshop</span>
                </Link>
                <div className="px-8">
                  <Search />
                </div>
                <div className="flex items-center gap-3">
                  <HeaderCartLink
                    label="Warenkorb"
                    hoverClassName="hover:text-black"
                    icon={<CartIcon />}
                  />
                  <HeaderNavLink
                    href="/orders"
                    label="Bestellhistorie"
                    hoverClassName="hover:text-black"
                    icon={<OrdersIcon />}
                  />
                  <HeaderNavLink
                    href="/ausleihe"
                    label="Ausleihen"
                    hoverClassName="hover:text-black"
                    icon={<LendingIcon />}
                  />
                  {session.user.role === "ADMIN" || session.user.role === "TEACHER" ? (
                    <HeaderNavLink
                      href="/teacher/orders"
                      label="Freigaben"
                      hoverClassName="hover:text-black"
                      icon={<ApprovalsIcon />}
                      badgeLabel={openApprovalsCount > 0 ? openApprovalsLabel : undefined}
                    />
                  ) : null}
                  {session.user.role === "ADMIN" ? (
                    <HeaderNavLink
                      href="/backend"
                      label="Administration"
                      hoverClassName="hover:text-black"
                      icon={<AdministrationIcon />}
                    />
                  ) : null}
                  <div className="relative z-[60]">
                    <div className="group relative inline-flex min-w-24 flex-col items-center text-muted-foreground transition-colors hover:text-primary">
                      <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border text-xs font-semibold text-foreground">
                        {session.user.image ? (
                          // Use Entra profile image if available.
                          <img
                            src={session.user.image}
                            alt={session.user.name ? `${session.user.name} Profilbild` : "Profilbild"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          (session.user.name ?? session.user.email?.split("@")[0] ?? "B")
                            .slice(0, 2)
                            .toUpperCase()
                        )}
                      </span>
                      <p className="pt-1 text-sm font-medium text-muted-foreground">Mein Benutzer</p>
                      <div className="pointer-events-none absolute top-full z-[70] mt-1 w-72 rounded-lg border border-border bg-card p-3 opacity-0 shadow-md transition-all group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                        <p className="text-sm font-medium text-center text-foreground">
                          {session.user.name ?? session.user.email?.split("@")[0] ?? "Benutzer"}
                        </p>
                        <p className="text-xs text-center text-muted-foreground">
                          {session.user.email ?? "vorname.nachname@htl-braunau.at"}
                        </p>
                        <div className="mt-2 flex justify-center">
                          <div className="inline-flex items-center gap-2 px-2 text-muted-foreground">
                            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/75">
                              Rollen
                            </span>
                            <span className="inline-flex rounded-full border border-border/80 bg-background px-2.5 py-0.5 text-[11px] font-medium leading-none text-foreground">
                              {roleLabels[session.user.role]}
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-center mt-2 flex gap-3 border-t border-border/70 pt-2.5">
                          <Link
                            href="/api/auth/signout"
                            className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
                          >
                            Abmelden
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
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
