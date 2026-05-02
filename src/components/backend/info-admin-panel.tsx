"use client";

import { useEffect, useState } from "react";
import { Card, DetailText } from "../ui/detail-card";
import * as TableUI from "~/components/ui/table";
import { api } from "~/trpc/react";

export function InfoAdminPanel() {
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
        ? "!text-emerald-700"
        : pingMs <= 200
          ? "!text-amber-700"
          : "!text-red-700";

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Info</h1>
      </header>


      <Card variant="detail" className="!w-190 !bg-card/40 hover:!bg-card/40">
        <div className="grid grid-cols-2 gap-3 items-center">
          <DetailText variant="kicker">
            Datenbank          
          </DetailText>
          <DetailText variant="value" className="justify-self-end">
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
          </DetailText>

        </div>

        <div className="mt-3">
          <TableUI.Subtable tableClassName="table-fixed text-left">
            <TableUI.SubtableHeader className="bg-muted/50 [&_th]:text-muted-foreground">
              <tr className="hover:bg-transparent">
                <TableUI.SubtableHead className="w-[40%] min-w-[12rem]">
                  Name
                </TableUI.SubtableHead>
                <TableUI.SubtableHead className="w-[28%] min-w-[10rem]">
                  Version
                </TableUI.SubtableHead>
                <TableUI.SubtableHead className="w-[14%] whitespace-nowrap tabular-nums">
                  Ping
                </TableUI.SubtableHead>
                <TableUI.SubtableHead className="w-[18%] whitespace-nowrap">
                  Zeitstempel
                </TableUI.SubtableHead>
              </tr>
            </TableUI.SubtableHeader>
            <TableUI.SubtableBody>
              <TableUI.SubtableRow className="hover:bg-transparent">
                <TableUI.SubtableCell className="font-medium">
                  <div className="min-w-0 truncate" title={dbInfoQuery.data?.databaseName ?? undefined}>
                    {dbInfoQuery.data?.databaseName ?? (dbInfoQuery.isLoading ? "…" : "—")}
                  </div>
                </TableUI.SubtableCell>
                <TableUI.SubtableCell className="font-medium">
                  <div className="min-w-0 truncate" title={dbInfoQuery.data?.version ?? undefined}>
                    {dbInfoQuery.data?.versionShort ?? (dbInfoQuery.isLoading ? "…" : "—")}
                  </div>
                </TableUI.SubtableCell>
                <TableUI.SubtableCell className={`font-semibold tabular-nums ${pingToneClass}`}>
                  {pingMs != null
                    ? `${pingMs} ms`
                    : dbHealthQuery.isLoading
                      ? "…"
                      : "—"}
                </TableUI.SubtableCell>
                <TableUI.SubtableCell className="text-muted-foreground">
                  {checkedAt ? checkedAt.toLocaleString() : "…"}
                </TableUI.SubtableCell>
              </TableUI.SubtableRow>
            </TableUI.SubtableBody>
          </TableUI.Subtable>

          {dbHealthQuery.data && !dbHealthQuery.data.healthy ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {dbHealthQuery.data.errorMessage ? `Hinweis: ${dbHealthQuery.data.errorMessage}` : null}
            </p>
          ) : null}
        </div>
        
      </Card>
    </div>
  );
}

