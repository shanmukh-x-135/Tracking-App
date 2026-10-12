import type { AssistantRef } from "@/lib/assistant/contract";
import type { CatalogMedia } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";

/**
 * Per-request table of titles the tools actually returned. The model may only
 * point at these by id; everything a card shows comes from here, never from
 * the model's own words.
 */
export class RefTable {
  private readonly byId = new Map<string, AssistantRef>();
  private readonly byKey = new Map<string, string>();
  private readonly fresh: AssistantRef[] = [];

  add(media: CatalogMedia, origin: AssistantRef["origin"], extra: Pick<AssistantRef, "facts" | "reason" | "seed"> = {}): string {
    const key = mediaKey(media);
    const existing = this.byKey.get(key);
    if (existing) {
      const ref = this.byId.get(existing)!;
      // A title confirmed in the user's records outranks the same title seen as a catalog result.
      if (origin === "your_mosaic" && ref.origin === "catalog") { ref.origin = "your_mosaic"; delete ref.reason; delete ref.seed; }
      if (extra.facts) ref.facts = { ...ref.facts, ...extra.facts };
      this.fresh.push(ref);
      return existing;
    }
    const id = `r${this.byId.size + 1}`;
    const ref: AssistantRef = {
      id, origin,
      media: { provider: media.provider, mediaType: media.mediaType, providerId: media.providerId, title: media.title, posterUrl: media.posterUrl, releaseYear: media.releaseYear },
      ...extra,
    };
    this.byId.set(id, ref);
    this.byKey.set(key, id);
    this.fresh.push(ref);
    return id;
  }

  get(id: string): AssistantRef | undefined { return this.byId.get(id); }
  keyOf(id: string): string | undefined {
    const ref = this.byId.get(id);
    return ref ? `${ref.media.provider}:${ref.media.mediaType}:${ref.media.providerId}` : undefined;
  }

  /** Refs added or updated since the last call, deduplicated. */
  takeFresh(): AssistantRef[] {
    const refs = [...new Map(this.fresh.map((ref) => [ref.id, ref])).values()];
    this.fresh.length = 0;
    return refs.map((ref) => structuredClone(ref));
  }
}

const tokenPattern = /^r\d{1,4}$/;
const maxPendingToken = 12;

/**
 * Streams model text through, keeping `[[rN]]` tokens only when `rN` is a
 * known ref. Tokens can be split across chunks, so a short unterminated tail is
 * held back until the next chunk.
 */
export class RefTextFilter {
  private buffer = "";
  readonly cited: string[] = [];

  constructor(private readonly isKnown: (id: string) => boolean) {}

  push(text: string): string {
    this.buffer += text;
    let out = "";
    while (this.buffer) {
      const start = this.buffer.indexOf("[[");
      if (start < 0) {
        const hold = this.buffer.endsWith("[") ? 1 : 0;
        out += this.buffer.slice(0, this.buffer.length - hold);
        this.buffer = this.buffer.slice(this.buffer.length - hold);
        break;
      }
      out += this.buffer.slice(0, start);
      this.buffer = this.buffer.slice(start);
      const end = this.buffer.indexOf("]]");
      if (end < 0) {
        if (this.buffer.length <= maxPendingToken) break;
        out += this.buffer.slice(0, 2);
        this.buffer = this.buffer.slice(2);
        continue;
      }
      const token = this.buffer.slice(2, end).trim();
      this.buffer = this.buffer.slice(end + 2);
      if (tokenPattern.test(token) && this.isKnown(token)) {
        if (!this.cited.includes(token)) this.cited.push(token);
        out += `[[${token}]]`;
      }
    }
    return out;
  }

  flush(): string {
    const rest = this.buffer.startsWith("[[") ? "" : this.buffer;
    this.buffer = "";
    return rest;
  }
}

/** Earlier turns arrive as plain text; any leftover ref tokens are meaningless in a new request. */
export function stripRefTokens(text: string): string {
  return text.replace(/\[\[[^\]]{0,12}\]\]/g, "");
}
