"use client";

import { useMemo, useState } from "react";

import { Input } from "~/components/ui/input";
import type { RouterOutputs } from "~/trpc/react";

export type DirectoryEntry = RouterOutputs["approval"]["directory"]["entries"][number];

function matches(entry: DirectoryEntry, term: string) {
  if (!term) return true;
  const needle = term.toLowerCase();
  return entry.name.toLowerCase().includes(needle) || entry.email.toLowerCase().includes(needle);
}

function SearchList({
  entries,
  onPick,
  placeholder,
  disabled,
  describe,
}: {
  entries: DirectoryEntry[];
  onPick: (entry: DirectoryEntry) => void;
  placeholder: string;
  disabled?: boolean;
  describe?: (entry: DirectoryEntry) => string | null;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => entries.filter((entry) => matches(entry, term.trim())).slice(0, 50), [entries, term]);

  return (
    <div className="relative">
      <Input
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        disabled={disabled}
        className="border border-primary/10"
      />
      {open && !disabled ? (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Keine Treffer.</li>
          ) : (
            filtered.map((entry) => {
              const hint = describe?.(entry);
              return (
                <li key={entry.key}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onPick(entry);
                      setTerm("");
                      setOpen(false);
                    }}
                    className="flex w-full flex-col items-start rounded-sm px-3 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="text-sm font-medium text-foreground">{entry.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.email}
                      {hint ? ` · ${hint}` : ""}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Pick exactly one teacher (or none when `allowClear`). */
export function TeacherPicker({
  entries,
  value,
  onChange,
  placeholder = "Lehrkraft suchen...",
  allowClear,
  disabled,
}: {
  entries: DirectoryEntry[];
  value: DirectoryEntry | null;
  onChange: (entry: DirectoryEntry | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
}) {
  if (value) {
    return (
      <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-primary/10 bg-card/40 px-3">
        <span className="min-w-0 truncate text-sm">
          <span className="font-medium text-foreground">{value.name}</span>{" "}
          <span className="text-muted-foreground">{value.email}</span>
        </span>
        {!disabled ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-xs font-medium text-muted-foreground hover:text-destructive"
            aria-label={allowClear ? "Auswahl entfernen" : "Auswahl ändern"}
          >
            {allowClear ? "Entfernen" : "Ändern"}
          </button>
        ) : null}
      </div>
    );
  }

  return <SearchList entries={entries} onPick={onChange} placeholder={placeholder} disabled={disabled} />;
}

/** Pick several teachers, shown as removable chips. */
export function TeacherMultiPicker({
  entries,
  value,
  onChange,
  describe,
  disabled,
}: {
  entries: DirectoryEntry[];
  value: DirectoryEntry[];
  onChange: (entries: DirectoryEntry[]) => void;
  describe?: (entry: DirectoryEntry) => string | null;
  disabled?: boolean;
}) {
  const selectedKeys = new Set(value.map((entry) => entry.key));
  const available = entries.filter((entry) => !selectedKeys.has(entry.key));

  return (
    <div className="space-y-2">
      <SearchList
        entries={available}
        onPick={(entry) => onChange([...value, entry])}
        placeholder="Lehrkraft hinzufügen..."
        disabled={disabled}
        describe={describe}
      />
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine Mitglieder.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {value.map((entry) => {
            const hint = describe?.(entry);
            return (
              <li
                key={entry.key}
                className="inline-flex items-center gap-2 rounded-full bg-primary/10 py-1 pl-3 pr-1 text-xs text-foreground"
                title={entry.email}
              >
                <span>
                  {entry.name}
                  {hint ? <span className="text-accent-orange"> · {hint}</span> : null}
                </span>
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((item) => item.key !== entry.key))}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    aria-label={`${entry.name} entfernen`}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
