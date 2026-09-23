import type { MosaicState } from "@/lib/persistence/types";
import { deriveCurrentMedia, type CurrentMediaItem } from "@/lib/current-media/projection";

export type ContinueKind = CurrentMediaItem["kind"];
export type ContinueItem = CurrentMediaItem;

/** Returns only meaningful unfinished personal states; movies intentionally do not appear. */
export function deriveContinue(state: MosaicState, options: { limit?: number } = {}): ContinueItem[] {
  return deriveCurrentMedia(state, options);
}
