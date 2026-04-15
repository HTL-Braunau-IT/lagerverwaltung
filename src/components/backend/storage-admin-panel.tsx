"use client";

import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

export function StorageAdminPanel() {
  const router = useRouter();

  return (
    <Card className="rounded-2xl bg-transparent p-5">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-foreground">Lagerplaetze</h2>
        <p className="text-sm text-muted-foreground">Lagerräume verwalten und Lagerplätze anlegen.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="rounded-2xl p-4">
          <h3 className="text-base font-semibold text-foreground">Lagerräume</h3>
          <p className="mt-1 text-sm text-muted-foreground">Räume anlegen, bearbeiten und löschen.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => router.push("/backend/storage/rooms")}>
              Lagerräume öffnen
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/backend/storage/rooms/new")}>
              Neuer Lagerraum
            </Button>
          </div>
        </Card>

        <Card className="rounded-2xl p-4">
          <h3 className="text-base font-semibold text-foreground">Lagerplätze</h3>
          <p className="mt-1 text-sm text-muted-foreground">Plätze anlegen, filtern, bearbeiten und löschen.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => router.push("/backend/storage/locations")}>
              Lagerplätze öffnen
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/backend/storage/locations/new")}>
              Neuer Lagerplatz
            </Button>
          </div>
        </Card>
      </div>
    </Card>
  );
}
