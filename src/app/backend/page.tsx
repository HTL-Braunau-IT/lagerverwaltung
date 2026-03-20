import { redirect } from "next/navigation";

import { auth } from "~/server/auth";

export default async function BackendPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-700">Administrator</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Backend</h1>
        <p className="mt-3 text-sm text-slate-600">
          Hier bauen wir alle Administrator-Funktionen zentral auf.
        </p>
      </section>
    </main>
  );
}
