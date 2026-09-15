import { parseUsage, UsageSnapshot } from '../model/usage';
import { missing, readTail } from './local-files';

export async function readLatestUsage(files: readonly string[], home: string, signal?: AbortSignal): Promise<UsageSnapshot | undefined> {
  signal?.throwIfAborted();
  let latest: UsageSnapshot | undefined;
  for (const file of files.slice(0, 5)) {
    signal?.throwIfAborted();
    let tail: string | undefined;
    try { tail = await readTail(file, home, 1024 * 1024); }
    catch (error) {
      if (missing(error)) continue;
      throw error;
    }
    signal?.throwIfAborted();
    const snapshot = tail === undefined ? undefined : parseUsage(tail);
    if (snapshot && (!latest || snapshot.observedAt > latest.observedAt)) latest = snapshot;
  }
  return latest;
}
