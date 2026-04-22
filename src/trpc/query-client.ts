import {
  defaultShouldDehydrateQuery,
  MutationCache,
  QueryCache,
  QueryClient,
  type Mutation,
} from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import SuperJSON from "superjson";

import { getToastApi } from "~/components/ui/toast";
import type { AppRouter } from "~/server/api/root";

const FALLBACK_MESSAGE = "Ein Fehler ist aufgetreten.";

function extractMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const trpcError = error as TRPCClientError<AppRouter>;
    const zodError = trpcError.data?.zodError as
      | { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] }
      | undefined
      | null;
    if (zodError) {
      const fieldErrors = Object.entries(zodError.fieldErrors ?? {})
        .flatMap(([field, messages]) =>
          (messages ?? []).map((msg: string) => `${field}: ${msg}`),
        );
      const formErrors = zodError.formErrors ?? [];
      const combined = [...formErrors, ...fieldErrors].filter(Boolean);
      if (combined.length > 0) return combined.join("\n");
    }
    return trpcError.message || FALLBACK_MESSAGE;
  }
  if (error instanceof Error) return error.message || FALLBACK_MESSAGE;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

type SilentMeta = { silent?: boolean };

function isSilent(meta: unknown): boolean {
  return typeof meta === "object" && meta !== null && (meta as SilentMeta).silent === true;
}

function mutationHasCustomErrorHandler(mutation: Mutation<unknown, unknown, unknown, unknown>): boolean {
  return typeof mutation.options.onError === "function";
}

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isSilent(query.meta)) return;
        // Only toast on the first failure of this query to avoid retry spam.
        if (query.state.fetchFailureCount > 1) return;
        const api = getToastApi();
        if (!api) return;
        api.error(extractMessage(error));
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (isSilent(mutation.meta)) return;
        // If the component defined its own onError handler, respect it and stay silent here.
        if (mutationHasCustomErrorHandler(mutation)) return;
        const api = getToastApi();
        if (!api) return;
        api.error(extractMessage(error));
      },
    }),
  });
