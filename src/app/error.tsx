"use client";

import { useEffect } from "react";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <section className="w-full rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-rose-700">Fehler</p>
        <h1 className="mt-1 text-2xl font-semibold text-rose-900">Etwas ist schiefgelaufen</h1>
        <p className="mt-2 text-sm text-rose-800">
          Die Seite konnte nicht korrekt geladen werden. Bitte versuche es erneut.
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-800 transition hover:bg-rose-100"
        >
          Erneut versuchen
        </button>
      </section>
    </main>
  );
}
