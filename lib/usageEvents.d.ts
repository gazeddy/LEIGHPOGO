export interface UsageEventInput {
  type: string;
  ownerId: number;
  path?: string | null;
  userAgent?: string;
  metadata?: Record<string, unknown> | null;
}

export type UsageDevice = "mobile" | "tablet" | "desktop";

export function classifyUsageDevice(userAgent?: string): UsageDevice;

export function recordUsageEvent(
  input: UsageEventInput,
): Promise<unknown | null>;
