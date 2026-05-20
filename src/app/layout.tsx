import "~/styles/globals.css";

import { type Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";

import { MicrosoftSignInButton } from "~/components/auth/microsoft-sign-in-button";
import { SignOutButton } from "~/components/auth/sign-out-button";
import { HeaderCartLink } from "~/components/layout/header-cart-link";
import { HeaderNavLink } from "~/components/layout/header-nav-link";
import { Search } from "~/components/layout/search";
import { ShopProductCountProvider } from "~/components/shop/shop-product-count-context";
import {
  AdministrationIcon,
  ApprovalsIcon,
  CartIcon,
  HeaderBrandPackageIcon,
  LendingIcon,
  OrdersIcon,
} from "~/components/layout/icon-renders";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  getStorageRoomAccessForUser,
  orderRoomWhereForAccess,
} from "~/server/api/routers/utils/storage-access";
import { TRPCReactProvider } from "~/trpc/react";
import { DetailText } from "~/components/ui/detail-card";
import { CountUp } from "~/components/ui/count-up";

export const metadata: Metadata = {
  title: "HTL Braunau Lagershop",
  description: "Lagershop für die HTL",
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

  const isAdmin = session?.user.role === "ADMIN";
  let openAdminLabel: string | undefined;
  if (isAdmin && session?.user.id) {
    const access = await getStorageRoomAccessForUser(db, session.user.id);
    const roomWhere = orderRoomWhereForAccess(access);
    const [openOrdersCount, openLoansCount] = await Promise.all([
      db.order.count({
        where: {
          status: "OPEN",
          ...(roomWhere ?? {}),
        },
      }),
      db.loan.count({
        where: {
          status: { in: ["PENDING", "APPROVED"] },
          ...(roomWhere ?? {}),
        },
      }),
    ]);
    const openAdminCount = openOrdersCount + openLoansCount;
    openAdminLabel = openAdminCount > 99 ? "99+" : String(openAdminCount);
  }

  /** Same filters the shop already exposes anonymously via public TRPC routes — aggregates only. */
  const guestShopStats = !session?.user
    ? await Promise.all([
        db.product.count({
          where: { isVisible: true, quantityOnHand: { gt: 0 } },
        }),
        db.category.count({
          where: {
            OR: [
              { products: { some: { isVisible: true } } },
              { productLinks: { some: { product: { isVisible: true } } } },
            ],
          },
        }),
        db.partList.count({
          where: { items: { some: {} } },
        }),
      ]).then(([availableProducts, categoriesWithVisibleProducts, partListsWithItems]) => ({
        availableProducts,
        categoriesWithVisibleProducts,
        partListsWithItems,
      }))
    : null;

  return (
    <html lang="de" className={inter.variable}>
      <body className="bg-background text-foreground antialiased">
        {session?.user ? (
          <TRPCReactProvider session={session}>
            <ShopProductCountProvider>
            <header
              data-app-shell-header="true"
              className="sticky top-5 z-50 mx-auto w-[calc(90%-2rem)] overflow-visible glass sm:w-[calc(90%-3rem)] lg:w-[calc(90%-4rem)]"
            >
              <div className="grid w-full grid-cols-[max-content_minmax(0,1fr)_auto] items-center gap-4 px-6">
                <Link
                  href="/"
                  prefetch={false}
                  className="group flex items-center gap-2 rounded-lg text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="inline-flex text-primary/85 transition-colors group-hover:text-primary">
                    <HeaderBrandPackageIcon className="h-8 w-8 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:scale-100" />
                  </span>
                  <span className="flex min-w-0 flex-col items-center text-center leading-tight">
                    <span className="w-full text-center text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
                      HTL Braunau
                    </span>
                    <span className="w-full text-center text-lg font-bold tracking-tight text-foreground transition-colors sm:text-xl group-hover:text-primary">
                      Lagershop
                    </span>
                  </span>
                </Link>
                <div className="flex min-w-0 w-full items-center justify-center p-4">
                  <div className="w-full min-w-0 max-w-[3840px]">
                    <Search />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <HeaderCartLink label="Warenkorb" icon={<CartIcon />} />
                  <HeaderNavLink
                    href="/orders"
                    label="Bestellhistorie"
                    accent="orders"
                    icon={<OrdersIcon />}
                  />
                  <HeaderNavLink
                    href="/loans"
                    label="Ausleihen"
                    accent="loans"
                    icon={<LendingIcon className="h-7 w-7 pl-1" />}
                  />
                  {session.user.role === "ADMIN" || session.user.role === "TEACHER" ? (
                    <HeaderNavLink
                      href="/teacher/orders"
                      label="Freigaben"
                      accent="approvals"
                      icon={<ApprovalsIcon />}
                      badgeLabel={openApprovalsLabel}
                    />
                  ) : null}
                  {session.user.role === "ADMIN" ? (
                    <HeaderNavLink
                      href="/backend"
                      label="Administration"
                      accent="admin"
                      icon={<AdministrationIcon />}
                      badgeLabel={openAdminLabel}
                    />
                  ) : null}
                  <div className="relative z-[60]">
                    <div className="group relative w-max">
                      <div className="inline-flex min-w-24 cursor-default flex-col items-center gap-0.5 border-b-2 border-b-transparent px-1 py-0.5 font-medium text-muted-foreground/85 transition-colors group-hover:text-primary/80">
                        <span className="relative flex h-9 w-9 items-center justify-center text-inherit">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-[0.5px] border-border text-[11px] font-semibold text-foreground transition-[color,border-color] group-hover:border-primary/45">
                            {session.user.image ? (
                              // Use Entra profile image if available.
                              <img
                                src={session.user.image}
                                alt={session.user.name ? `${session.user.name} Profilbild` : "Profilbild"}
                                className="block h-full w-full object-cover"
                              />
                            ) : (
                              (session.user.name ?? session.user.email?.split("@")[0] ?? "B")
                                .slice(0, 2)
                                .toUpperCase()
                            )}
                          </span>
                        </span>
                        <span className="text-sm leading-tight">Mein Benutzer</span>
                      </div>
                      <div className="pointer-events-none absolute right-0 top-full z-[70] mt-1 w-72 max-w-[min(18rem,calc(100vw-1.25rem))] -translate-x-2 rounded-md bg-card/95 backdrop-blur-md backdrop-saturate-150 bg-blur-2xl p-3 opacity-0 transition-all group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 text-center">
                        <DetailText variant="value">{session.user.name ?? session.user.email?.split("@")[0] ?? "Benutzer"}</DetailText>
                        <DetailText variant="subvalue">{session.user.email ?? "vorname.nachname@htl-braunau.at"}</DetailText>
                        <div className="mt-2 flex justify-center">
                          <div className="inline-flex items-center gap-2 px-2 text-muted-foreground">
                            <DetailText variant="kicker" className="!text-muted-foreground/60">Rollen</DetailText>
                            <span className="inline-flex rounded-full bg-primary/80 px-2.5 py-0.5 text-[11px] font-medium leading-none text-white">
                              {roleLabels[session.user.role]}
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-center mt-2 flex gap-3 border-t border-border/70 pt-2.5">
                          <SignOutButton />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </header>
            {children}
            </ShopProductCountProvider>
          </TRPCReactProvider>
        ) : (
          <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4 sm:p-6">
            <div
              className="pointer-events-none absolute inset-0 scale-105 bg-cover bg-center bg-no-repeat transform-gpu"
              style={{ backgroundImage: "url('/images/htl-login-background.jpg')" }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 backdrop-blur-[1px]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_35%,rgba(0,0,0,0.20)_100%)]"
              aria-hidden
            />
            <section className="relative z-10 w-full max-w-md overflow-hidden rounded-md bg-card/60 hover:bg-card/65 transition shadow-xl backdrop-blur-md border border-card/20 select-none">
              <div>
                <div className="flex flex-col gap-3 p-6 text-center lg:text-left">
                  <Link
                    href="/"
                    prefetch={false}
                    className="group mx-auto flex w-full max-w-sm items-center justify-center gap-3 text-foreground outline-none lg:mx-0 lg:max-w-none lg:justify-center"
                  >
                    <span className="inline-flex shrink-0 text-primary/85 transition-colors group-hover:text-primary">
                      <HeaderBrandPackageIcon className="h-11 w-11 transition-transform duration-300 ease-out motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:scale-100" />
                    </span>
                    <span className="flex min-w-0 flex-col items-center text-center leading-tight lg:items-center lg:text-center">
                      <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
                        HTL Braunau
                      </span>
                      <span className="mt-0.5 text-2xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                        Lagershop
                      </span>
                    </span>
                  </Link>
                  <span className="text-sm leading-snug text-muted-foreground text-center">
                  Interne Plattform für Lagerverwaltung und Bestellung.
                  </span>

                  {guestShopStats ? (
                    <div className="border-t border-black/5 pt-3">
                      <dl className="grid grid-cols-3 gap-3">
                        <div className="rounded-sm bg-card/60 px-2 py-2 text-center hover:bg-card/80 transition">
                          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/75">
                            Produkte
                          </dt>
                          <dd className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
                            <CountUp value={guestShopStats.availableProducts} />
                          </dd>
                        </div>
                        <div className="rounded-sm bg-card/60 px-2 py-2 text-center hover:bg-card/80 transition">
                          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/75">
                            Kategorien
                          </dt>
                          <dd className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
                            <CountUp value={guestShopStats.categoriesWithVisibleProducts} />
                          </dd>
                        </div>
                        <div className="rounded-sm bg-card/60 px-2 py-2 text-center hover:bg-card/80 transition">
                          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/75">
                            Teilelisten
                          </dt>
                          <dd className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
                            <CountUp value={guestShopStats.partListsWithItems} />
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-3 flex justify-center lg:justify-start">
                        <MicrosoftSignInButton />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </main>
        )}
      </body>
    </html>
  );
}
