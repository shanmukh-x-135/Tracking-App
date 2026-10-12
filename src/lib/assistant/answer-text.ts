import type { AssistantRef } from "@/lib/assistant/contract";

export type AnswerPart = { type: "text"; text: string } | { type: "ref"; ref: AssistantRef };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits answer text into plain text and verified title refs for rendering.
 * Models sometimes repeat a title right after its token ("[[r1]] — *Title*") or
 * add Markdown emphasis; both are dropped so each title appears once, as a link.
 */
export function answerParts(text: string, refs: Map<string, AssistantRef>): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const pieces = text.replace(/^\s+/, "").split(/(\[\[r\d+\]\])/g);
  for (let index = 0; index < pieces.length; index += 1) {
    const id = /^\[\[(r\d+)\]\]$/.exec(pieces[index])?.[1];
    if (!id) {
      const plain = pieces[index].replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1$2").replace(/^#{1,6}\s+/gm, "");
      if (plain) parts.push({ type: "text", text: plain });
      continue;
    }
    const ref = refs.get(id);
    if (!ref) continue;
    parts.push({ type: "ref", ref });
    // Drop an echoed title immediately after the token, e.g. " — *Low Tide*" or " (Low Tide)".
    const echo = new RegExp(`^\\s*(?:[—–:-]\\s*)?[(“"*_]*${escapeRegExp(ref.media.title)}[)”"*_]*`, "i");
    if (pieces[index + 1]) pieces[index + 1] = pieces[index + 1].replace(echo, "");
  }
  return parts;
}
