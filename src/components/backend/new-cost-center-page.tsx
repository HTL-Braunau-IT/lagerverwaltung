"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";

type CostCenterForm = {
  name: string;
};

function createEmptyForm(): CostCenterForm {
  return { name: "" };
}

function toCostCenterCode(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function NewCostCenterPage() {
  const router = useRouter();
  const utils = api.useUtils();

  const [form, setForm] = useState<CostCenterForm>(createEmptyForm);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const generatedCode = useMemo(() => toCostCenterCode(form.name.trim()), [form.name]);
  const canSave = form.name.trim().length > 0 && generatedCode.length > 0;

  const createMutation = api.costCenter.backendCreate.useMutation();

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neue Kostenstelle</h2>
        </div>
      </div>

      {submitError ? <p className="mb-3 text-sm text-destructive">{submitError}</p> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Name
          <Input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            className="mt-1 h-10 rounded-xl"
            autoFocus
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Code (automatisch)
          <Input value={generatedCode} readOnly className="mt-1 h-10 rounded-xl" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={async () => {
            setSubmitError(null);
            try {
              await createMutation.mutateAsync({ code: generatedCode, name: form.name.trim() });
            } catch (error) {
              setSubmitError(error instanceof Error ? error.message : "Kostenstelle konnte nicht erstellt werden.");
              return;
            }
            await Promise.all([utils.costCenter.backendList.invalidate(), utils.costCenter.list.invalidate()]);
            router.push("/backend/cost-centers");
          }}
          disabled={!canSave || createMutation.isPending}
        >
          {createMutation.isPending ? "Erstellt..." : "Kostenstelle erstellen"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/backend/cost-centers")}>
          Abbrechen
        </Button>
      </div>
    </Card>
  );
}

