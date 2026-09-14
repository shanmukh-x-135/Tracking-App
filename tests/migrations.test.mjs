import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync("supabase/migrations/20260912160736_mosaic_core.sql", "utf8");
const tracking = readFileSync("supabase/migrations/20260912160738_mosaic_domain_tracking.sql", "utf8");
const imports = readFileSync("supabase/migrations/20260912232742_import_foundation.sql", "utf8");
const importApplication = readFileSync("supabase/migrations/20260913051334_import_application.sql", "utf8");
const importUndo = readFileSync("supabase/migrations/20260913111212_import_undo.sql", "utf8");
const listEditor = readFileSync("supabase/migrations/20260913184222_list_editor.sql", "utf8");
const restrictedGrants = readFileSync("supabase/migrations/20260914120327_restrict_data_api_grants.sql", "utf8");
const hostedHardening = readFileSync("supabase/migrations/20260914120455_harden_extensions_and_foreign_keys.sql", "utf8");
const listWritePolicies = readFileSync("supabase/migrations/20260914122626_split_list_write_policies.sql", "utf8");
const sql = `${core}\n${tracking}\n${imports}\n${importApplication}\n${importUndo}\n${listEditor}\n${restrictedGrants}\n${hostedHardening}\n${listWritePolicies}`;

const protectedTables = [
  "profiles", "media_items", "library_entries", "ratings", "reviews", "lists", "list_items",
  "movie_watch_logs", "tv_episodes", "episode_watch_logs", "episode_ratings", "game_playthroughs", "book_readings",
  "import_jobs", "import_records", "import_provenance",
];

test("every exposed Mosaic table enables row level security", () => {
  for (const table of protectedTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("write policies derive ownership from auth.uid", () => {
  const writePolicies = sql.match(/create policy[\s\S]*?;/gi) ?? [];
  const ownedWrites = writePolicies.filter((policy) => /for (all|insert|update|delete)/i.test(policy));
  assert.ok(ownedWrites.length > 0);
  for (const policy of ownedWrites) {
    assert.match(policy, /auth\.uid\(\)/i);
  }
});

test("cross-media list ordering and provider identity are constrained", () => {
  assert.match(core, /unique \(provider, media_type, external_id\)/i);
  assert.match(core, /unique \(list_id, position\)/i);
  assert.doesNotMatch(core, /movie_lists|game_lists|book_lists/i);
});

test("import jobs enforce ownership, stable records, and provenance", () => {
  assert.match(sql, /unique \(import_job_id, source_record_key\)/i);
  assert.match(sql, /unique \(user_id, source, source_record_key, target_kind\)/i);
  assert.match(sql, /foreign key \(import_job_id, user_id\)[\s\S]*?references public\.import_jobs\(id, user_id\)/i);
  assert.match(sql, /create index import_records_job_resolution_idx/i);
  assert.match(sql, /create policy import_jobs_owner_all[\s\S]*?auth\.uid\(\)/i);
  assert.match(importApplication, /create or replace function public\.apply_import_record/i);
  assert.match(importApplication, /security definer[\s\S]*?auth\.uid\(\)/i);
  assert.match(importApplication, /revoke execute on function public\.apply_import_record[\s\S]*?from public, anon/i);
  assert.match(importUndo, /create or replace function public\.undo_import_job/i);
  assert.match(importUndo, /imported_fingerprint[\s\S]*?preserved_modified/i);
  assert.match(importUndo, /revoke execute on function public\.undo_import_job\(uuid\) from public, anon/i);
});

test("Data API roles receive only Mosaic's explicit table privileges", () => {
  assert.match(restrictedGrants, /revoke all privileges on table[\s\S]*?from anon, authenticated/i);
  assert.match(restrictedGrants, /grant select on table[\s\S]*?to anon, authenticated/i);
  assert.match(restrictedGrants, /grant update on table public\.profiles to authenticated/i);
  assert.match(restrictedGrants, /grant insert on table public\.media_items, public\.tv_episodes to authenticated/i);
  assert.match(restrictedGrants, /grant select, insert, update, delete on table[\s\S]*?to authenticated/i);
  assert.match(restrictedGrants, /revoke execute on function private\.set_updated_at\(\) from public, anon, authenticated/i);
  assert.doesNotMatch(restrictedGrants, /grant\s+(all|truncate|references|trigger)\b/i);
});

test("hosted schema keeps extensions private and covers ownership foreign keys", () => {
  assert.match(hostedHardening, /alter extension pg_trgm set schema extensions/i);
  assert.match(hostedHardening, /import_records \(import_job_id, user_id\)/i);
  assert.match(hostedHardening, /import_provenance \(import_job_id, user_id\)/i);
  assert.match(hostedHardening, /import_provenance \(import_record_id, import_job_id, user_id\)/i);
});

test("list reads use one visibility policy while writes stay owner-scoped", () => {
  assert.match(listWritePolicies, /drop policy lists_owner_all/i);
  assert.match(listWritePolicies, /drop policy list_items_owner_all/i);
  for (const table of ["lists", "list_items"]) {
    for (const command of ["insert", "update", "delete"]) {
      assert.match(listWritePolicies, new RegExp(`create policy ${table}_owner_${command}[\\s\\S]*?auth\\.uid\\(\\)`, "i"));
    }
  }
});
