"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { ArrowLeftIcon } from "~/components/layout/icon-renders";

type CategoryForm = {
  name: string;
};

function toCategorySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function NewCategoryPage() {
  const router = useRouter();
  const utils = api.useUtils();

  const [form, setForm] = useState<CategoryForm>({ name: "" });

  const generatedSlug = toCategorySlug(form.name.trim());
  const canSave = form.name.trim().length > 0 && generatedSlug.length > 0;

  const createMutation = api.category.backendCreate.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.category.backendList.invalidate(), utils.category.list.invalidate()]);
      router.push("/backend/categories");
    },
  });

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Neue Kategorie</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-sm text-muted-foreground">
          Name
          <span className="text-destructive pl-1">*</span>
          <Input
            value={form.name}
            onChange={(event) => setForm({ name: event.target.value })}
            variant="title"
          />
        </label>
        <label className="text-sm text-muted-foreground">
          Slug (automatisch)
          <Input
            value={generatedSlug}
            disabled
            variant="subtitle"
          />
        </label>
      </div>

      <div className="flex justify-between mt-4">
        <Button
          type="button"
          variant="glass"
          onClick={() => router.push("/backend/categories")}
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
          className="!w-36"
          onClick={() =>
            createMutation.mutate({
              name: form.name.trim(),
              slug: generatedSlug,
            })
          }
          disabled={!canSave || createMutation.isPending}
        >
          {createMutation.isPending ? "Erstellt..." : "Kategorie erstellen"}
        </Button>
      </div>
    </Card>
  );
}

