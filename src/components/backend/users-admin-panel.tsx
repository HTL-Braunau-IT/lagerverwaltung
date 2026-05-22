"use client";

import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "~/components/ui/button";
import { Card as ShellCard } from "~/components/ui/card";
import * as TableUI from "~/components/ui/table";
import { useToast } from "~/components/ui/toast";
import { api } from "~/trpc/react";
import { isDirty } from "~/components/backend/dirty";
import { UnsavedChangesBar } from "~/components/backend/unsaved-changes-bar";
import { Card, DetailText } from "../ui/detail-card";


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
  const toast = useToast();
  const searchParams = useSearchParams();
  const searchTerm = (searchParams.get("search") ?? "").trim();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [formsByUserId, setFormsByUserId] = useState<Record<string, UserAccessForm>>({});
  const [baselineByUserId, setBaselineByUserId] = useState<Record<string, UserAccessForm>>({});

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
      toast.success("Benutzerzugriff aktualisiert.");
    },
  });

  const users = useMemo(
    () =>
      [...(usersQuery.data?.pages.flatMap((page) => page.items) ?? [])].sort((a, b) =>
        (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""),
      ),
    [usersQuery.data],
  );

  const expandedContext = useMemo(() => {
    if (!expandedUserId) return null;
    const user = users.find((u) => u.id === expandedUserId);
    if (!user) return null;
    const baseline = baselineByUserId[user.id] ?? createInitialForm(user);
    const current = formsByUserId[user.id] ?? baseline;
    const normalize = (f: UserAccessForm) => ({
      hasAllStorageRoomAccess: f.hasAllStorageRoomAccess,
      storageRoomIds: [...f.storageRoomIds].sort(),
    });
    const dirty = isDirty(current, baseline, normalize);
    const canSave = current.hasAllStorageRoomAccess || current.storageRoomIds.length > 0;
    return { user, baseline, current, dirty, canSave };
  }, [baselineByUserId, expandedUserId, formsByUserId, users]);

  return (
    <ShellCard className="bg-transparent">
      <div className="mb-3 mt-1 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Benutzer</h2>
        </div>
      </div>

      <div className="overflow-x-auto">
        <TableUI.Table>
          <TableUI.TableHeader>
            <tr>
              <TableUI.TableHead>Name</TableUI.TableHead>
              <TableUI.TableHead>E-Mail</TableUI.TableHead>
              <TableUI.TableHead>Rolle</TableUI.TableHead>
              <TableUI.TableHead>Lagerraumzugriff</TableUI.TableHead>
            </tr>
          </TableUI.TableHeader>
          <TableUI.TableBody>
            {usersQuery.isLoading ? (
              <TableUI.TableRow className="cursor-default">
                <TableUI.TableCell colSpan={4} className="text-muted-foreground">
                  Benutzer werden geladen...
                </TableUI.TableCell>
              </TableUI.TableRow>
            ) : null}
            {usersQuery.error ? (
              <TableUI.TableRow className="cursor-default">
                <TableUI.TableCell colSpan={4} className="text-destructive">
                  Benutzer konnten nicht geladen werden.
                </TableUI.TableCell>
              </TableUI.TableRow>
            ) : null}
            {!usersQuery.isLoading && !usersQuery.error && users.length === 0 ? (
              <TableUI.TableRow className="cursor-default">
                <TableUI.TableCell colSpan={4} className="text-muted-foreground">
                  Keine Benutzer gefunden.
                </TableUI.TableCell>
              </TableUI.TableRow>
            ) : null}
            {users.map((user) => {
              const isExpanded = expandedUserId === user.id;
              const form = formsByUserId[user.id] ?? createInitialForm(user);

              return (
                <Fragment key={user.id}>
                  <TableUI.TableRow
                    onClick={() => {
                      setExpandedUserId((current) => (current === user.id ? null : user.id));
                      setFormsByUserId((current) => ({
                        ...current,
                        [user.id]: current[user.id] ?? createInitialForm(user),
                      }));
                      setBaselineByUserId((current) => ({
                        ...current,
                        [user.id]: current[user.id] ?? createInitialForm(user),
                      }));
                    }}
                    className={`cursor-pointer select-none`}
                  >
                    <TableUI.TableCell className="font-medium text-foreground">{user.name ?? "-"}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{user.email ?? "-"}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">{user.role}</TableUI.TableCell>
                    <TableUI.TableCell className="text-muted-foreground">
                      {user.hasAllStorageRoomAccess ? "Alle Lagerraeume" : `${user.storageRoomAccesses.length} Raeume`}
                    </TableUI.TableCell>
                  </TableUI.TableRow>

                  <TableUI.TableExpandableRow
                    open={isExpanded}
                    colSpan={4}
                    rowClassName="bg-muted/30"
                    cellClassName="p-3"
                  >
                    <div className="grid grid-cols-1 gap-3 p-1 md:grid-cols-2 ">
                      <div className="space-y-3">
                        <Card variant="detail">
                          <DetailText variant="kicker">Name</DetailText>
                          <DetailText variant="value">{user.name ?? "-"}</DetailText>
                        </Card>
                        <Card variant="detail">
                          <DetailText variant="kicker">Email</DetailText>
                          <DetailText variant="value">{user.email ?? "keine E-Mail"}</DetailText>
                        </Card>
                        <Card variant="detail">
                          <DetailText variant="kicker">Rollen</DetailText>
                          <DetailText variant="value">{user.role}</DetailText>
                        </Card>
                      </div>

                      <div className="w-full space-y-4 md:max-w-sm">
                          <div className="max-h-52 space-y-1 overflow-y-auto rounded-md bg-card/40 px-3 py-2">
                            <label className="block text-sm text-muted-foreground">
                              Erlaubte Lagerräume
                            </label>
                            {(storageRoomsQuery.data ?? []).map((room) => (
                              <label key={room.id} className="flex items-center gap-2 text-sm text-foreground hover:bg-card rounded-xs">
                                <input
                                  type="checkbox"
                                  checked={form.storageRoomIds.includes(room.id)}
                                  disabled={form.hasAllStorageRoomAccess}
                                  onChange={(event) =>
                                    setFormsByUserId((current) => ({
                                      ...current,
                                      [user.id]: {
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

                        <button
                          type="button"
                          onClick={() =>
                            setFormsByUserId((current) => ({
                              ...current,
                              [user.id]: {
                                ...form,
                                hasAllStorageRoomAccess: !form.hasAllStorageRoomAccess,
                              },
                            }))
                          }
                          className="w-full rounded-md bg-card/40 px-3 py-2 text-left transition"
                          aria-label="Alle Lagerraeume umschalten"
                          aria-pressed={form.hasAllStorageRoomAccess}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-muted-foreground">
                              <div className="font-medium text-foreground">Alle Lagerräume</div>
                            </div>
                            <span
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                                form.hasAllStorageRoomAccess ? "bg-primary" : "bg-slate-300"
                              }`}
                              aria-hidden="true"
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                                  form.hasAllStorageRoomAccess ? "translate-x-5" : "translate-x-1"
                                }`}
                              />
                            </span>                            
                          </div>                          
                        </button>
                        {!form.hasAllStorageRoomAccess && form.storageRoomIds.length === 0 ? (
                          <p className="px-2 text-xs text-destructive">
                            Bitte mindestens einen Lagerraum auswählen oder „Alle Lagerräume“ aktivieren.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableUI.TableExpandableRow>
                </Fragment>
              );
            })}
          </TableUI.TableBody>
        </TableUI.Table>
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

      <UnsavedChangesBar
        open={!!expandedContext?.dirty}
        title={expandedContext?.user.name ?? expandedContext?.user.email ?? "Benutzer"}
        onReset={() => {
          if (!expandedContext) return;
          setFormsByUserId((current) => ({
            ...current,
            [expandedContext.user.id]: expandedContext.baseline,
          }));
        }}
        onSave={() => {
          if (!expandedContext) return;
          if (updateAccessMutation.isPending) return;
          if (!expandedContext.canSave) return;
          updateAccessMutation.mutate(
            {
              userId: expandedContext.user.id,
              hasAllStorageRoomAccess: expandedContext.current.hasAllStorageRoomAccess,
              storageRoomIds: expandedContext.current.storageRoomIds,
            },
            {
              onSuccess: () => {
                setBaselineByUserId((current) => ({
                  ...current,
                  [expandedContext.user.id]: expandedContext.current,
                }));
              },
            },
          );
        }}
        saveDisabled={updateAccessMutation.isPending || !expandedContext?.canSave}
        resetDisabled={updateAccessMutation.isPending}
        saveLabel={updateAccessMutation.isPending ? "Speichert..." : "Speichern"}
      />

    </ShellCard>
  );
}
