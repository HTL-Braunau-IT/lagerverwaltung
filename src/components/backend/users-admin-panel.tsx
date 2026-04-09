"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/trpc/react";

type UserAccessForm = {
  hasAllStorageRoomAccess: boolean;
  storageRoomIds: string[];
};

function createInitialForm(user: {
  hasAllStorageRoomAccess: boolean;
  storageRoomAccesses: Array<{ storageRoomId: string }>;
}): UserAccessForm {
  return {
    hasAllStorageRoomAccess: user.hasAllStorageRoomAccess,
    storageRoomIds: user.storageRoomAccesses.map((entry) => entry.storageRoomId),
  };
}

export function UsersAdminPanel() {
  const utils = api.useUtils();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [formsByUserId, setFormsByUserId] = useState<Record<string, UserAccessForm>>({});

  const usersQuery = api.user.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const storageRoomsQuery = api.storageRoom.list.useQuery();

  const updateAccessMutation = api.user.backendUpdateStorageAccess.useMutation({
    onSuccess: async () => {
      await utils.user.backendList.invalidate();
    },
  });

  const users = useMemo(
    () =>
      [...(usersQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) =>
        (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""),
      ),
    [usersQuery.data],
  );

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  return (
    <Card className="rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Benutzer</h2>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Name</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>Rolle</TableHead>
              <TableHead>Lagerraumzugriff</TableHead>
              <TableHead>Aktion</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {usersQuery.isLoading ? (
              <tr>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Benutzer werden geladen...
                </TableCell>
              </tr>
            ) : null}
            {usersQuery.error ? (
              <tr>
                <TableCell colSpan={5} className="text-destructive">
                  Benutzer konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}
            {!usersQuery.isLoading && !usersQuery.error && users.length === 0 ? (
              <tr>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Keine Benutzer gefunden.
                </TableCell>
              </tr>
            ) : null}
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium text-foreground">{user.name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{user.email ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{user.role}</TableCell>
                <TableCell className="text-muted-foreground">
                  {user.hasAllStorageRoomAccess ? "Alle Lagerraeume" : `${user.storageRoomAccesses.length} Raeume`}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedUserId(user.id);
                      setFormsByUserId((current) => ({
                        ...current,
                        [user.id]: current[user.id] ?? createInitialForm(user),
                      }));
                    }}
                  >
                    Bearbeiten
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {usersQuery.hasNextPage ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void usersQuery.fetchNextPage()}
            disabled={usersQuery.isFetchingNextPage}
          >
            {usersQuery.isFetchingNextPage ? "Lade mehr..." : "Mehr laden"}
          </Button>
        </div>
      ) : null}

      {selectedUser ? (
        <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
          {(() => {
            const form = formsByUserId[selectedUser.id] ?? createInitialForm(selectedUser);

            return (
              <>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">Benutzer bearbeiten</h3>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelectedUserId(null);
                    }}
                  >
                    Auswahl aufheben
                  </Button>
                </div>

                <p className="text-sm text-muted-foreground">
                  {selectedUser.name ?? "-"} ({selectedUser.email ?? "keine E-Mail"}) - Rolle: {selectedUser.role}
                </p>

                <label className="mt-4 block text-xs text-muted-foreground">
                  Alle Lagerraeume
                  <div className="mt-1 flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                    <span className="text-sm text-foreground">
                      {form.hasAllStorageRoomAccess
                        ? "Der Benutzer darf alle Lagerraeume im Backend sehen."
                        : "Der Benutzer darf nur explizit ausgewaehlte Lagerraeume sehen."}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFormsByUserId((current) => ({
                          ...current,
                          [selectedUser.id]: {
                            ...form,
                            hasAllStorageRoomAccess: !form.hasAllStorageRoomAccess,
                          },
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                        form.hasAllStorageRoomAccess ? "bg-primary" : "bg-slate-300"
                      }`}
                      aria-label="Alle Lagerraeume umschalten"
                      aria-pressed={form.hasAllStorageRoomAccess}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                          form.hasAllStorageRoomAccess ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </label>

                <label className="mt-4 block text-xs text-muted-foreground">
                  Erlaubte Lagerraeume
                  <div className="mt-1 max-h-52 space-y-2 overflow-y-auto rounded-lg border border-border bg-card px-3 py-2">
                    {(storageRoomsQuery.data ?? []).map((room) => (
                      <label key={room.id} className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={form.storageRoomIds.includes(room.id)}
                          disabled={form.hasAllStorageRoomAccess}
                          onChange={(event) =>
                            setFormsByUserId((current) => ({
                              ...current,
                              [selectedUser.id]: {
                                ...form,
                                storageRoomIds: event.target.checked
                                  ? [...form.storageRoomIds, room.id]
                                  : form.storageRoomIds.filter((id) => id !== room.id),
                              },
                            }))
                          }
                          className="h-4 w-4 rounded border-input"
                        />
                        <span>{room.name}</span>
                      </label>
                    ))}
                    {(storageRoomsQuery.data?.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground">Keine Lagerraeume vorhanden.</p>
                    ) : null}
                  </div>
                </label>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      updateAccessMutation.mutate({
                        userId: selectedUser.id,
                        hasAllStorageRoomAccess: form.hasAllStorageRoomAccess,
                        storageRoomIds: form.storageRoomIds,
                      })
                    }
                    disabled={
                      updateAccessMutation.isPending ||
                      (!form.hasAllStorageRoomAccess && form.storageRoomIds.length === 0)
                    }
                  >
                    {updateAccessMutation.isPending ? "Speichert..." : "Rechte speichern"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setFormsByUserId((current) => ({
                        ...current,
                        [selectedUser.id]: createInitialForm(selectedUser),
                      }))
                    }
                  >
                    Zuruecksetzen
                  </Button>
                </div>
              </>
            );
          })()}
        </div>
      ) : null}
    </Card>
  );
}
