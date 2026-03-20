import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-700">404</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Seite nicht gefunden</h1>
        <p className="mt-2 text-sm text-slate-600">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
        >
          Zur Startseite
        </Link>
      </section>
    </main>
  );
}
