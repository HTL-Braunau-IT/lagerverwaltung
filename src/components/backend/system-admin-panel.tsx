"use client";

import { useEffect, useState } from "react";

import { api } from "~/trpc/react";

export function SystemAdminPanel() {
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const dbInfoQuery = api.system.dbInfo.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    meta: { silent: true },
  });
  const dbHealthQuery = api.system.dbHealth.useQuery(undefined, {
    refetchOnWindowFocus: false,
    meta: { silent: true },
  });

  useEffect(() => {
    if (dbHealthQuery.data) setCheckedAt(new Date());
  }, [dbHealthQuery.data]);

  const pingMs = dbHealthQuery.data?.pingMs ?? null;
  const pingToneClass =
    pingMs == null
      ? "text-foreground"
      : pingMs <= 50
        ? "text-emerald-700"
        : pingMs <= 200
          ? "text-amber-700"
          : "text-red-700";

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Info</h1>
      </header>

      <section className="w-fit">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold px-1">Datenbank</h2>
          {dbHealthQuery.isLoading ? (
            <span className="text-sm text-muted-foreground">Prüfe…</span>
          ) : dbHealthQuery.isError ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-flex h-2 w-2 rounded-full bg-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.25)]"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">Fehler</span>
            </span>
          ) : dbHealthQuery.data?.healthy ? (
            <span className="inline-flex items-center gap-2 px-1">
              <span
                className="inline-flex h-2 w-2 rounded-full bg-emerald-600 shadow-[0_0_0_3px_rgba(5,150,105,0.25)]"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">Healthy</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-flex h-2 w-2 rounded-full bg-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.25)]"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">Unhealthy</span>
            </span>
          )}
        </div>

        <div className="mt-4 inline-block w-fit overflow-hidden rounded-md border border-border align-top">
          <table className="w-auto text-sm bg-card">
            <thead className="bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2 text-left">
                  Name
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Version
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Ping
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Zeitstempel
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 font-medium" title={dbInfoQuery.data?.databaseName ?? undefined}>
                  <span className="block max-w-[240px] truncate">
                    {dbInfoQuery.data?.databaseName ?? (dbInfoQuery.isLoading ? "…" : "—")}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium" title={dbInfoQuery.data?.version ?? undefined}>
                  <span className="block max-w-[240px] truncate">
                    {dbInfoQuery.data?.versionShort ?? (dbInfoQuery.isLoading ? "…" : "—")}
                  </span>
                </td>
                <td className={`px-3 py-2 font-semibold ${pingToneClass}`}>
                  {pingMs != null
                    ? `${pingMs} ms`
                    : dbHealthQuery.isLoading
                      ? "…"
                      : "—"}
                </td>
                <td className="px-3 py-2 font-medium">{checkedAt ? checkedAt.toLocaleString() : "…"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {dbHealthQuery.data && !dbHealthQuery.data.healthy ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {dbHealthQuery.data.errorMessage ? `Hinweis: ${dbHealthQuery.data.errorMessage}` : null}
          </p>
        ) : null}
      </section>
    </div>
  );
}

