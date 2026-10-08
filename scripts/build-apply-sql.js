/**
 * BURNBOARD — build supabase/APPLY_TO_LIVE_DB.sql
 *
 * Generates the one-shot SQL that is pasted into the Supabase SQL Editor to
 * create the whole schema on a fresh/empty project.
 *
 * Why this script exists: the previous bundle was produced by concatenating
 * `supabase/migrations/*.sql` only. Migrations are *incremental* — migration
 * 001 starts with `ALTER TABLE user_profiles ...` while `user_profiles` is not
 * created until migration 006, so on an empty database the very first
 * statement failed with 42P01 and rolled the whole script back.
 *
 * The bundle is therefore built as:
 *   1. supabase/schema.sql              (base tables)
 *   2. supabase/patch_missing_tables.sql(base tables added later; idempotent)
 *   3. supabase/migrations/*.sql        (incremental, filename order)
 *
 * Two statement kinds are rewritten so the whole file survives a re-run:
 *   - `create policy "X" on T ...`  -> prefixed with `drop policy if exists`
 *   - `alter publication P add table T` -> wrapped in a DO/EXCEPTION guard
 *     (duplicate table additions otherwise abort with 42710)
 *
 * Usage: node scripts/build-apply-sql.js
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_DIR = path.join(__dirname, '..', 'supabase');
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, 'migrations');
const OUT_FILE = path.join(SUPABASE_DIR, 'APPLY_TO_LIVE_DB.sql');

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const PUBLICATION_RE = /^(\s*)alter\s+publication\s+(?:public\.)?([a-z0-9_]+)\s+add\s+table\s+(?:public\.)?([a-z0-9_]+)\s*;\s*$/i;
const RAW_POLICY_RE = /^(\s*)create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?([a-z0-9_]+)\s/i;
const DOLLAR_TAG_RE = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g;

/**
 * Apply `transform` to the parts of `sql` that sit OUTSIDE dollar-quoted
 * bodies (i.e. not inside `DO $$ ... $$` or `AS $$ ... $$`). Rewriting a
 * statement that is already inside a DO block produces invalid nesting.
 */
function transformOutsideDollarQuotes(sql, transform) {
  let out = '';
  let cursor = 0;
  let match;
  DOLLAR_TAG_RE.lastIndex = 0;
  while ((match = DOLLAR_TAG_RE.exec(sql)) !== null) {
    const openTag = match[0];
    // Text between the previous body and this opening tag is plain SQL.
    out += transform(sql.slice(cursor, match.index));
    const close = sql.indexOf(openTag, match.index + openTag.length);
    if (close === -1) {
      // Unterminated dollar quote — leave the remainder untouched.
      out += sql.slice(match.index);
      return out;
    }
    out += sql.slice(match.index, close + openTag.length);
    cursor = close + openTag.length;
    DOLLAR_TAG_RE.lastIndex = cursor;
  }
  out += transform(sql.slice(cursor));
  return out;
}

/**
 * Wrap `alter publication ... add table ...` so adding a table twice (the
 * migrations do this) does not abort the script.
 */
function guardPublications(sql) {
  return transformOutsideDollarQuotes(sql, (chunk) =>
    chunk
      .split('\n')
      .map((line) => {
        const m = line.match(PUBLICATION_RE);
        if (!m) return line;
        const [, indent, publication, table] = m;
        return (
          `${indent}do $$ begin alter publication ${publication} add table ${table}; ` +
          `exception when duplicate_object or undefined_table then null; end $$;`
        );
      })
      .join('\n')
  );
}

/**
 * Make unguarded `create policy` statements re-runnable.
 * Only used on the base schema; migrations already guard theirs with
 * `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object` where needed.
 */
function guardPolicies(sql) {
  return transformOutsideDollarQuotes(sql, (chunk) => {
    const out = [];
    for (const line of chunk.split('\n')) {
      const m = line.match(RAW_POLICY_RE);
      if (m) {
        const [, indent, name, table] = m;
        out.push(`${indent}drop policy if exists "${name}" on ${table};`);
      }
      out.push(line);
    }
    return out.join('\n');
  });
}

function section(title, body) {
  const bar = '-- ' + '─'.repeat(60);
  return `${bar}\n-- ${title}\n${bar}\n\n${body.trim()}\n`;
}

function main() {
  const schema = guardPublications(guardPolicies(read(path.join(SUPABASE_DIR, 'schema.sql'))));
  const patch = guardPublications(read(path.join(SUPABASE_DIR, 'patch_missing_tables.sql')));

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const migrations = migrationFiles
    .map((f) => {
      const body = guardPublications(read(path.join(MIGRATIONS_DIR, f)));
      return section(`FILE: migrations/${f}`, body);
    })
    .join('\n');

  const header = `-- ============================================================
-- BURNBOARD - ONE-SHOT LIVE DB SETUP
-- Run ONCE in Supabase Dashboard > SQL Editor on an empty project.
--
-- Built by scripts/build-apply-sql.js. Do not edit by hand.
--
-- Order matters and is deliberate:
--   1. base tables          (supabase/patch_missing_tables.sql)
--   2. base schema          (supabase/schema.sql)
--   3. migrations           (supabase/migrations/*.sql, filename order)
--
-- patch_missing_tables.sql holds the CURRENT definition of the core tables
-- (profiles.is_banned/is_hidden, roasts.is_hidden, ...) and must come first;
-- schema.sql only adds the tables patch does not define (user_profiles,
-- follows, daily_winner). Migrations are incremental and ALTER the tables
-- created by (1) and (2), so they cannot be applied on their own to an
-- empty database.
--
-- Statements are idempotent where possible: CREATE TABLE/INDEX IF NOT
-- EXISTS, guarded policies and publication membership. The script runs as
-- a single transaction, so a failure rolls the whole thing back.
--
-- Generated: ${new Date().toISOString().slice(0, 10)}
-- ============================================================
`;

  const sql =
    header +
    '\n' +
    section('SECTION 1/3 — BASE TABLES (supabase/patch_missing_tables.sql)', patch) +
    '\n' +
    section('SECTION 2/3 — BASE SCHEMA (supabase/schema.sql)', schema) +
    '\n' +
    section('SECTION 3/3 — MIGRATIONS', migrations);

  fs.writeFileSync(OUT_FILE, sql);
  const lines = sql.split('\n').length;
  console.log(`Wrote ${path.relative(path.join(__dirname, '..'), OUT_FILE)} (${lines} lines, ${migrationFiles.length} migrations)`);
}

main();
