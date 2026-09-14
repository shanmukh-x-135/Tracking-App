import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
assert.ok(url && key, "SUPABASE_URL and SUPABASE_ANON_KEY are required");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const owner = createClient(url, key, options);
const stranger = createClient(url, key, options);
const suffix = process.env.MOSAIC_TEST_SUFFIX || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const isLocal = ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
const emailDomain = process.env.MOSAIC_TEST_EMAIL_DOMAIN || (isLocal ? "mosaic.local" : undefined);
assert.ok(emailDomain, "MOSAIC_TEST_EMAIL_DOMAIN is required for hosted Auth tests; use a controlled inbox domain");

async function signUp(client, label) {
  const { data, error } = await client.auth.signUp({
    email: `mosaic-${label}-${suffix}@${emailDomain}`,
    password: "Mosaic-test-2026",
    options: { data: { display_name: `${label} account` } },
  });
  assert.ifError(error);
  if (data.user && data.session) return data.user;

  const signedIn = await client.auth.signInWithPassword({
    email: `mosaic-${label}-${suffix}@${emailDomain}`,
    password: "Mosaic-test-2026",
  });
  assert.ifError(signedIn.error);
  assert.ok(signedIn.data.user && signedIn.data.session, `${label} requires a confirmed disposable account`);
  return signedIn.data.user;
}

const ownerUser = await signUp(owner, "owner");
await signUp(stranger, "stranger");

const { data: profile, error: profileError } = await stranger
  .from("profiles")
  .select("id,display_name")
  .eq("id", ownerUser.id)
  .single();
assert.ifError(profileError);
assert.equal(profile.display_name, "owner account", "profile bootstrap should create a public profile");

const { data: media, error: mediaError } = await owner
  .from("media_items")
  .insert({ provider: "mock", media_type: "movie", external_id: `rls-${suffix}`, title: "RLS Test Film" })
  .select("id")
  .single();
assert.ifError(mediaError);

const { data: library, error: libraryError } = await owner
  .from("library_entries")
  .insert({ user_id: ownerUser.id, media_id: media.id, status: "watched" })
  .select("id")
  .single();
assert.ifError(libraryError);

const ownerRead = await owner.from("library_entries").select("id").eq("id", library.id);
assert.ifError(ownerRead.error);
assert.equal(ownerRead.data.length, 1, "owners should read their library rows");

const strangerRead = await stranger.from("library_entries").select("id").eq("id", library.id);
assert.ifError(strangerRead.error);
assert.equal(strangerRead.data.length, 0, "private history must be invisible cross-user");

const impersonation = await stranger.from("library_entries").insert({
  user_id: ownerUser.id,
  media_id: media.id,
  status: "watchlist",
});
assert.ok(impersonation.error, "RLS must reject a client-supplied foreign user_id");

const { data: list, error: listError } = await owner
  .from("lists")
  .insert({ user_id: ownerUser.id, title: "Private test list", visibility: "private" })
  .select("id")
  .single();
assert.ifError(listError);

const privateListRead = await stranger.from("lists").select("id").eq("id", list.id);
assert.ifError(privateListRead.error);
assert.equal(privateListRead.data.length, 0, "private lists must be invisible cross-user");

const crossUserUpdate = await stranger
  .from("lists")
  .update({ title: "Taken over" })
  .eq("id", list.id)
  .select("id");
assert.ifError(crossUserUpdate.error);
assert.equal(crossUserUpdate.data.length, 0, "cross-user list updates must affect no rows");

const { data: secondMedia, error: secondMediaError } = await owner
  .from("media_items")
  .insert({ provider: "mock", media_type: "book", external_id: `list-${suffix}`, title: "RLS Test Book" })
  .select("id")
  .single();
assert.ifError(secondMediaError);
const { data: listItems, error: listItemsError } = await owner
  .from("list_items")
  .insert([{ list_id: list.id, media_id: media.id, position: 0 }, { list_id: list.id, media_id: secondMedia.id, position: 1 }])
  .select("id,position")
  .order("position");
assert.ifError(listItemsError);
const forbiddenReorder = await stranger.rpc("reorder_list_items", { p_list_id: list.id, p_item_ids: listItems.map(({ id }) => id).reverse() });
assert.ok(forbiddenReorder.error, "another user cannot reorder an owner's list");
const incompleteReorder = await owner.rpc("reorder_list_items", { p_list_id: list.id, p_item_ids: [listItems[0].id] });
assert.ok(incompleteReorder.error, "list reorder must include every item exactly once");
const reordered = await owner.rpc("reorder_list_items", { p_list_id: list.id, p_item_ids: [listItems[1].id, listItems[0].id] });
assert.ifError(reordered.error);
const reorderedItems = await owner.from("list_items").select("id,position").eq("list_id", list.id).order("position");
assert.ifError(reorderedItems.error);
assert.deepEqual(reorderedItems.data.map(({ id, position }) => [id, position]), [[listItems[1].id, 0], [listItems[0].id, 1]], "owner reorder should be persisted without position collisions");

const { data: importJob, error: importJobError } = await owner
  .from("import_jobs")
  .insert({ user_id: ownerUser.id, source: "generic_movies", status: "ready", original_filename: "movies.csv", file_sha256: "a".repeat(64) })
  .select("id")
  .single();
assert.ifError(importJobError);

const privateJobRead = await stranger.from("import_jobs").select("id").eq("id", importJob.id);
assert.ifError(privateJobRead.error);
assert.equal(privateJobRead.data.length, 0, "private import jobs must be invisible cross-user");

const foreignRecord = await stranger.from("import_records").insert({
  user_id: ownerUser.id,
  import_job_id: importJob.id,
  source_record_key: "forged",
  media_type: "movie",
  source_title: "Forged",
  normalized_payload: {},
});
assert.ok(foreignRecord.error, "RLS must reject records attached to another user's import job");

const sourceKey = `generic_movies:${suffix}`;
const { data: importRecord, error: importRecordError } = await owner.from("import_records").insert({
  user_id: ownerUser.id,
  import_job_id: importJob.id,
  source_record_key: sourceKey,
  media_type: "movie",
  source_title: "Imported Film",
  normalized_payload: { source: "generic_movies", sourceRecordKey: sourceKey, mediaType: "movie", title: "Imported Film", status: "watched", watchedDate: "2024-02-29", rating: 4.5, sourceMetadata: {} },
}).select("id").single();
assert.ifError(importRecordError);

const selectedMedia = { provider: "mock", providerId: `import-${suffix}`, mediaType: "movie", title: "Imported Film", releaseYear: 2024, genres: [] };
const forbiddenApply = await stranger.rpc("apply_import_record", { p_import_record_id: importRecord.id, p_selected_media: selectedMedia, p_conflict_policy: "review" });
assert.ok(forbiddenApply.error, "another user cannot apply an owner's import record");
for (let attempt = 0; attempt < 2; attempt += 1) {
  const applied = await owner.rpc("apply_import_record", { p_import_record_id: importRecord.id, p_selected_media: selectedMedia, p_conflict_policy: "review" });
  assert.ifError(applied.error);
}
const { data: importedMedia, error: importedMediaError } = await owner.from("media_items").select("id").eq("provider", "mock").eq("external_id", selectedMedia.providerId).single();
assert.ifError(importedMediaError);
const importedWatches = await owner.from("movie_watch_logs").select("id").eq("media_id", importedMedia.id);
assert.ifError(importedWatches.error);
assert.equal(importedWatches.data.length, 1, "re-applying the same source record must not duplicate watch history");
await owner.from("import_jobs").update({ status: "completed" }).eq("id", importJob.id);
const forbiddenUndo = await stranger.rpc("undo_import_job", { p_import_job_id: importJob.id });
assert.ok(forbiddenUndo.error, "another user cannot undo an owner's import job");
const undone = await owner.rpc("undo_import_job", { p_import_job_id: importJob.id });
assert.ifError(undone.error);
const watchesAfterUndo = await owner.from("movie_watch_logs").select("id").eq("media_id", importedMedia.id);
assert.ifError(watchesAfterUndo.error);
assert.equal(watchesAfterUndo.data.length, 0, "undo removes an unchanged row created by the import");

console.log("Live Supabase auth, list reorder, transactional import idempotency, safe undo, and owner-scoped RLS checks passed.");
