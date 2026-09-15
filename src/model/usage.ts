import { parseRecord, record } from '../util/json';

export interface UsageWindow { usedPercent: number; windowMinutes: number; resetsAt?: number }
export interface UsageSnapshot { observedAt: number; primary?: UsageWindow; secondary?: UsageWindow; source?: 'account' }

export function parseAccountUsage(value: unknown): UsageSnapshot | undefined {
  if (!record(value)) return undefined;
  const limits = record(value.rateLimitsByLimitId) ? value.rateLimitsByLimitId.codex : value.rateLimits;
  if (!record(limits) || (limits.limitId != null && limits.limitId !== 'codex')) return undefined;
  const convert = (window: unknown): UsageWindow | undefined => record(window) ? usageWindow({ used_percent: window.usedPercent, window_minutes: window.windowDurationMins, resets_at: window.resetsAt }) : undefined;
  const primary = convert(limits.primary);
  const secondary = convert(limits.secondary);
  return primary || secondary ? { observedAt: Date.now(), primary, secondary, source: 'account' } : undefined;
}

function usageWindow(value: unknown): UsageWindow | undefined {
  if (!record(value)) return undefined;
  const percent = value.used_percent;
  const minutes = value.window_minutes;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) return undefined;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes <= 0 || minutes > 525600) return undefined;
  const resetsAt = typeof value.resets_at === 'number' && Number.isFinite(value.resets_at) && value.resets_at > 0 && value.resets_at <= 8640000000000 ? value.resets_at * 1000 : undefined;
  return { usedPercent: percent, windowMinutes: minutes, resetsAt };
}

export function parseUsage(text: string): UsageSnapshot | undefined {
  let latest: UsageSnapshot | undefined;
  for (const line of text.split('\n')) {
    if (!line.includes('"rate_limits"')) continue;
    const event = parseRecord(line);
    if (event?.type !== 'event_msg' || !record(event.payload) || event.payload.type !== 'token_count') continue;
    const limits = event.payload.rate_limits;
    if (!record(limits) || (limits.limit_id != null && limits.limit_id !== 'codex')) continue;
    const observedAt = typeof event.timestamp === 'string' ? Date.parse(event.timestamp) : NaN;
    if (!Number.isFinite(observedAt)) continue;
    const primary = usageWindow(limits.primary);
    const secondary = usageWindow(limits.secondary);
    if ((primary || secondary) && (!latest || observedAt >= latest.observedAt)) latest = { observedAt, primary, secondary };
  }
  return latest;
}
