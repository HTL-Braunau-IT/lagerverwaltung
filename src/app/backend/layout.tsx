import { redirect } from "next/navigation";

import { BackendSidebarNav } from "~/components/backend/backend-sidebar-nav";
import { auth } from "~/server/auth";

export default async function BackendLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <BackendSidebarNav />
        {children}
      </div>
    </main>
  );
}
