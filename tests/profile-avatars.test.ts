import assert from "node:assert/strict";
import test from "node:test";
import { AVATAR_PRESETS, avatarPreset, avatarUrlProblem } from "../src/lib/profile/avatars";

test("presets, empty values and https links are accepted; everything else explains why not", () => {
  assert.equal(AVATAR_PRESETS.length, 8);
  for (const preset of AVATAR_PRESETS) {
    assert.equal(avatarUrlProblem(preset.src), undefined);
    assert.equal(avatarPreset(` ${preset.src} `)?.id, preset.id);
  }
  assert.equal(avatarUrlProblem(undefined), undefined);
  assert.equal(avatarUrlProblem("   "), undefined);
  assert.equal(avatarUrlProblem("https://cdn.example.com/me.png"), undefined);
  assert.match(avatarUrlProblem("http://example.com/me.png")!, /https/);
  assert.match(avatarUrlProblem("javascript:alert(1)")!, /https/);
  assert.match(avatarUrlProblem("/brand/mosaic/avatars/unknown.svg")!, /full image link/);
  assert.match(avatarUrlProblem("me.png")!, /full image link/);
  assert.match(avatarUrlProblem(`https://example.com/${"a".repeat(2100)}`)!, /too long/);
});
