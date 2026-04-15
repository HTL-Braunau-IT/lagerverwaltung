"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

type StorageRoomForm = {
  name: string;
};

function createEmptyRoomForm(): StorageRoomForm {
  return { name: "" };
}

export function StorageRoomsAdminPanel() {
  const utils = api.useUtils();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();

  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState<StorageRoomForm>(createEmptyRoomForm);

  const roomsQuery = api.storageRoom.backendList.useInfiniteQuery(
    {
      search: searchTerm || undefined,
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const roomItems = useMemo(
    () =>
      [...(roomsQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [roomsQuery.data],
  );

  const updateRoomMutation = api.storageRoom.backendUpdate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.storageRoom.backendList.invalidate(),
        utils.storageRoom.list.invalidate(),
        utils.storageLocation.backendList.invalidate(),
        utils.storageLocation.list.invalidate(),
        expandedRoomId ? utils.storageRoom.byId.invalidate({ id: expandedRoomId }) : Promise.resolve(),
      ]);
    },
  });
  const deleteRoomMutation = api.storageRoom.backendDelete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.storageRoom.backendList.invalidate(),
        utils.storageRoom.list.invalidate(),
        utils.storageLocation.backendList.invalidate(),
        utils.storageLocation.list.invalidate(),
      ]);
      setExpandedRoomId(null);
      setRoomForm(createEmptyRoomForm());
    },
  });

  const canSave = roomForm.name.trim().length > 0;

  return (
    <Card className="rounded-2xl bg-transparent">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Lagerräume</h2>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader className="bg-muted/50">
            <tr>
              <TableHead>Name</TableHead>
              <TableHead>Lagerplätze</TableHead>
            </tr>
          </TableHeader>
          <TableBody className="bg-white">
            {roomsQuery.isLoading ? (
              <tr>
                <TableCell colSpan={2} className="text-muted-foreground">
                  Lagerräume werden geladen...
                </TableCell>
              </tr>
            ) : null}
            {roomsQuery.error ? (
              <tr>
                <TableCell colSpan={2} className="text-destructive">
                  Lagerräume konnten nicht geladen werden.
                </TableCell>
              </tr>
            ) : null}
            {!roomsQuery.isLoading && !roomsQuery.error && roomItems.length === 0 ? (
              <tr>
                <TableCell colSpan={2} className="text-muted-foreground">
                  Keine Lagerräume gefunden.
                </TableCell>
              </tr>
            ) : null}
            {roomItems.map((room) => {
              const isExpanded = expandedRoomId === room.id;
              return (
                <Fragment key={room.id}>
                  <TableRow
                    onClick={() => {
                      setExpandedRoomId((current) => (current === room.id ? null : room.id));
                      setRoomForm((current) => (expandedRoomId === room.id ? current : { name: room.name }));
                    }}
                    className={`cursor-pointer bg-white hover:bg-muted/30 ${isExpanded ? "bg-muted/15" : ""} select-none`}
                  >
                    <TableCell className="font-medium text-foreground">{room.name}</TableCell>
                    <TableCell className="text-muted-foreground">{room._count.storageLocations}</TableCell>
                  </TableRow>

                  {isExpanded ? (
                    <tr className="bg-muted/30">
                      <td colSpan={2} className="p-3">
                        <div className="w-full p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h3 className="text-base font-semibold text-foreground">Lagerraum bearbeiten</h3>
                          </div>

                          <p className="text-sm text-muted-foreground">
                            Lagerplätze:{" "}
                            <span className="font-medium text-foreground">{room._count.storageLocations}</span>
                          </p>

                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="text-xs text-muted-foreground">
                              Name
                              <Input
                                value={roomForm.name}
                                onChange={(event) => setRoomForm({ name: event.target.value })}
                                className="mt-1 h-10 rounded-xl"
                                autoFocus
                              />
                            </label>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                updateRoomMutation.mutate({
                                  id: room.id,
                                  name: roomForm.name.trim(),
                                })
                              }
                              disabled={!canSave || updateRoomMutation.isPending}
                            >
                              {updateRoomMutation.isPending ? "Speichert..." : "Änderungen speichern"}
                            </Button>

                            <Button
                              type="button"
                              variant="destructive"
                              onClick={() => deleteRoomMutation.mutate({ id: room.id })}
                              disabled={deleteRoomMutation.isPending}
                            >
                              {deleteRoomMutation.isPending ? "Löscht..." : "Lagerraum löschen"}
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {roomsQuery.hasNextPage ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void roomsQuery.fetchNextPage()}
            disabled={roomsQuery.isFetchingNextPage}
          >
            {roomsQuery.isFetchingNextPage ? "Lade mehr..." : "Mehr laden"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

