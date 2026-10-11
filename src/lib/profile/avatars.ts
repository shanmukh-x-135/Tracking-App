/**
 * Built-in Mosaic avatars. A preset is stored in the existing `avatar_url`
 * column as its site-relative path, so it renders anywhere a URL already does
 * and legacy custom URLs keep working unchanged.
 */
export const AVATAR_PRESETS = [
  { id: "orbit", name: "Orbit" },
  { id: "prism", name: "Prism" },
  { id: "eclipse", name: "Eclipse" },
  { id: "nebula", name: "Nebula" },
  { id: "portal", name: "Portal" },
  { id: "aurora", name: "Aurora" },
  { id: "monolith", name: "Monolith" },
  { id: "mosaic", name: "Mosaic" },
].map((preset) => ({ ...preset, src: `/brand/mosaic/avatars/${preset.id}.svg` }));

export type AvatarPreset = (typeof AVATAR_PRESETS)[number];

export function avatarPreset(url?: string | null): AvatarPreset | undefined {
  return AVATAR_PRESETS.find(({ src }) => src === url?.trim());
}

/** Returns a user-facing problem with an avatar value, or undefined when it is acceptable. */
export function avatarUrlProblem(url?: string | null): string | undefined {
  const value = url?.trim();
  if (!value || avatarPreset(value)) return undefined;
  if (value.length > 2048) return "That image link is too long.";
  let parsed: URL;
  try { parsed = new URL(value); } catch { return "Enter a full image link starting with https://."; }
  if (parsed.protocol !== "https:") return "Image links must use https://.";
  return undefined;
}
