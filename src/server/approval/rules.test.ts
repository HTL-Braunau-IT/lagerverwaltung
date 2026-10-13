import { describe, expect, it } from "vitest";

import { appSettingsSchema } from "~/server/settings";
import {
  describeApprovalChanges,
  resolveApprovalRequirement,
  type ApprovalGroupForRules,
  type ApprovalSnapshot,
} from "./rules";

const defaults = appSettingsSchema.parse({}).approval;

const group: ApprovalGroupForRules = {
  id: "g1",
  isActive: true,
  approverId: "approver",
  deputyId: "deputy",
  amountLimit: null,
};

const teacher = { id: "teacher", role: "TEACHER" as const };

function resolve(overrides: Partial<Parameters<typeof resolveApprovalRequirement>[0]> = {}) {
  return resolveApprovalRequirement({
    orderer: teacher,
    memberGroup: group,
    approverUserIds: new Set(["approver", "deputy"]),
    settings: defaults,
    orderTotal: 100,
    ...overrides,
  });
}

describe("resolveApprovalRequirement", () => {
  it("routes group members to Freigeber and Vertretung", () => {
    expect(resolve()).toEqual({ required: true, approvalGroupId: "g1", approverIds: ["approver", "deputy"] });
  });

  it("skips approval when the workflow is disabled", () => {
    expect(resolve({ settings: { ...defaults, enabled: false } })).toEqual({ required: false, reason: "DISABLED" });
  });

  it("never requires approval for admins", () => {
    expect(resolve({ orderer: { id: "admin", role: "ADMIN" } })).toEqual({ required: false, reason: "ADMIN" });
  });

  it("auto-approves orders of Freigeber, Vertretung and fallback approver", () => {
    expect(resolve({ orderer: { id: "approver", role: "TEACHER" } })).toMatchObject({ reason: "IS_APPROVER" });
    expect(resolve({ orderer: { id: "deputy", role: "TEACHER" } })).toMatchObject({ reason: "IS_APPROVER" });
    expect(
      resolve({ memberGroup: null, settings: { ...defaults, fallbackApproverId: "teacher" } }),
    ).toMatchObject({ reason: "IS_APPROVER" });
  });

  it("sends teachers without group to the fallback approver", () => {
    expect(resolve({ memberGroup: null, settings: { ...defaults, fallbackApproverId: "fb" } })).toEqual({
      required: true,
      approvalGroupId: null,
      approverIds: ["fb"],
    });
  });

  it("treats an inactive group like no group", () => {
    expect(
      resolve({ memberGroup: { ...group, isActive: false }, settings: { ...defaults, fallbackApproverId: "fb" } }),
    ).toMatchObject({ required: true, approvalGroupId: null, approverIds: ["fb"] });
  });

  it("lets teachers order directly when nobody could approve", () => {
    expect(resolve({ memberGroup: null })).toEqual({ required: false, reason: "NO_APPROVER" });
  });

  it("skips approval up to the global amount limit when enabled", () => {
    const settings = { ...defaults, amountLimitEnabled: true, amountLimit: 50 };
    expect(resolve({ settings, orderTotal: 50 })).toMatchObject({ reason: "BELOW_LIMIT" });
    expect(resolve({ settings, orderTotal: 50.01 })).toMatchObject({ required: true });
    expect(resolve({ settings: { ...settings, amountLimitEnabled: false }, orderTotal: 10 })).toMatchObject({
      required: true,
    });
  });

  it("prefers the group amount limit over the global one", () => {
    const settings = { ...defaults, amountLimitEnabled: true, amountLimit: 50 };
    const withLimit = { ...group, amountLimit: 200 };
    expect(resolve({ settings, memberGroup: withLimit, orderTotal: 150 })).toMatchObject({ reason: "BELOW_LIMIT" });
    expect(resolve({ settings: defaults, memberGroup: withLimit, orderTotal: 150 })).toMatchObject({
      reason: "BELOW_LIMIT",
    });
    expect(resolve({ settings, memberGroup: { ...group, amountLimit: 0 }, orderTotal: 10 })).toMatchObject({
      required: true,
    });
  });
});

describe("describeApprovalChanges", () => {
  const original: ApprovalSnapshot = {
    costCenterId: "cc1",
    costCenterLabel: "Elektronik",
    items: [
      { productId: "p1", name: "Widerstand", quantity: 10, unit: "PCS" },
      { productId: "p2", name: "Kabel", quantity: 2.5, unit: "M" },
    ],
  };

  it("lists cost center, quantity changes and removed items", () => {
    const current: ApprovalSnapshot = {
      costCenterId: "cc2",
      costCenterLabel: "Mechanik",
      items: [{ productId: "p1", name: "Widerstand", quantity: 5, unit: "PCS" }],
    };
    expect(describeApprovalChanges(original, current)).toEqual([
      "Kostenstelle: Elektronik → Mechanik",
      "Widerstand: 10 Stk → 5 Stk",
      "Kabel: entfernt",
    ]);
  });

  it("returns nothing without changes or snapshot", () => {
    expect(describeApprovalChanges(original, original)).toEqual([]);
    expect(describeApprovalChanges(null, original)).toEqual([]);
  });
});
