"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";
import { ArrowLeftIcon } from "~/components/layout/icon-renders";

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
  const toast = useToast();

  const [form, setForm] = useState<CostCenterForm>(createEmptyForm);

  const generatedCode = useMemo(() => toCostCenterCode(form.name.trim()), [form.name]);
  const canSave = form.name.trim().length > 0 && generatedCode.length > 0;

  const createMutation = api.costCenter.backendCreate.useMutation({
    meta: { silent: true },
  });

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-3 mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neue Kostenstelle</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-sm text-muted-foreground">
          Name
          <span className="text-destructive pl-1">*</span>
          <Input
            value={form.name}
            variant="title"
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            className="mt-1"
          />
        </label>
        <label className="text-sm text-muted-foreground">
          Code (automatisch)
          <Input
            value={generatedCode}
            variant="subtitle"
            disabled
            className="mt-1"
            />
        </label>
      </div>

      <div className="flex justify-between mt-4">
        <Button
          type="button"
          variant="glass"
          onClick={() => router.push("/backend/cost-centers")}
          className="!w-36"
          >
          <span className="mr-2 inline-flex [&_svg]:h-4 [&_svg]:w-4">
            <ArrowLeftIcon />
          </span>
          Zurück
        </Button>
        <Button
          type="button"
          variant="solid"
          className="!w-48"
          onClick={async () => {
            try {
              await createMutation.mutateAsync({ code: generatedCode, name: form.name.trim() });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Kostenstelle konnte nicht erstellt werden.");
              return;
            }
            await Promise.all([utils.costCenter.backendList.invalidate(), utils.costCenter.list.invalidate()]);
            toast.success("Kostenstelle erstellt.");
            router.push("/backend/cost-centers");
          }}
          disabled={!canSave || createMutation.isPending}
        >
          {createMutation.isPending ? "Erstellt..." : "Kostenstelle erstellen"}
        </Button>
      </div>
    </Card>
  );
}

