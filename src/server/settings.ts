import { z } from "zod";

import { env } from "~/env";
import { db } from "~/server/db";

const APP_SETTINGS_KEY = "app";

const optionalEmail = z
  .string()
  .trim()
  .max(320)
  .refine((value) => value.length === 0 || z.email().safeParse(value).success, "Ungueltige E-Mail-Adresse.");

export const appSettingsSchema = z.object({
  approval: z
    .object({
      enabled: z.boolean().default(true),
      fallbackApproverId: z.string().min(1).nullable().default(null),
      amountLimitEnabled: z.boolean().default(false),
      amountLimit: z.number().min(0).max(1_000_000).default(0),
      reminderAfterDays: z.number().int().min(0).max(60).default(2),
    })
    .prefault({}),
  mail: z
    .object({
      approvalRequested: z.boolean().default(true),
      approvalDecided: z.boolean().default(true),
      approvalCancelled: z.boolean().default(true),
      approvalReminder: z.boolean().default(true),
      orderReleased: z.boolean().default(false),
      warehouseAddress: optionalEmail.default(""),
      opsBccAddress: optionalEmail.default(""),
    })
    .prefault({}),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export function parseAppSettings(value: unknown): AppSettings {
  const parsed = appSettingsSchema.safeParse(value ?? {});
  if (parsed.success) return parsed.data;
  console.warn("[settings] Gespeicherte Einstellungen ungueltig, verwende Standardwerte", parsed.error.issues);
  return appSettingsSchema.parse({});
}

export async function getAppSettings(client: Pick<typeof db, "appSetting"> = db): Promise<AppSettings> {
  const row = await client.appSetting.findUnique({
    where: { key: APP_SETTINGS_KEY },
    select: { value: true },
  });
  return parseAppSettings(row?.value);
}

export async function saveAppSettings(next: AppSettings, client: Pick<typeof db, "appSetting"> = db) {
  const value = appSettingsSchema.parse(next);
  await client.appSetting.upsert({
    where: { key: APP_SETTINGS_KEY },
    create: { key: APP_SETTINGS_KEY, value },
    update: { value },
  });
  return value;
}

/** Ops BCC from settings, falling back to the MAIL_OPS_BCC_ADDRESS env var. */
export async function resolveOpsBccRecipients() {
  let fromSettings = "";
  try {
    fromSettings = (await getAppSettings()).mail.opsBccAddress.trim();
  } catch (error) {
    console.error("[settings] Ops-BCC konnte nicht gelesen werden", error);
  }
  const email = fromSettings || env.MAIL_OPS_BCC_ADDRESS?.trim();
  return email ? [{ email }] : [];
}
