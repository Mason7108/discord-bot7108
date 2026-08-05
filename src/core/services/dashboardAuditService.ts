import { DashboardAuditEventModel } from "../../models/DashboardAuditEvent.js";

const SENSITIVE_KEY_PATTERN = /(token|secret|password|cookie|authorization|client_secret|bot_token|session)/i;

export function redactAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 300 ? `${value.slice(0, 297)}...` : value;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactAuditValue);
  }

  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactAuditValue(raw);
  }

  return result;
}

export async function recordDashboardAuditEvent(input: {
  guildId: string;
  actorUserId: string;
  actorDisplayName: string;
  action: string;
  targetType: string;
  targetId?: string;
  settingPath?: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
}) {
  return DashboardAuditEventModel.create({
    ...input,
    previousValue: redactAuditValue(input.previousValue),
    newValue: redactAuditValue(input.newValue),
    metadata: redactAuditValue(input.metadata) as Record<string, unknown> | undefined
  });
}
