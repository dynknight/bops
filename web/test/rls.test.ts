import assert from "node:assert/strict";
import { test } from "node:test";
import { asSuper, createTestDb, setAuth } from "./pg";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

async function seedOwner(db: Awaited<ReturnType<typeof createTestDb>>) {
  await asSuper(db);
  await db.query("insert into public.profiles (id, github_login, display_name) values ($1, 'dynknight', 'Heidi')", [OWNER]);
  await db.query("select public.seed_agents($1::uuid)", [OWNER]);
}

test("only dynknight can exist as a profile, and another user cannot read the owner's rows", async () => {
  const db = await createTestDb();
  await seedOwner(db);
  await assert.rejects(
    db.query("insert into public.profiles (id, github_login) values ($1, 'octocat')", [OTHER]),
    /dynknight|check/i,
  );

  await setAuth(db, "authenticated", OTHER);
  const profiles = await db.query("select id from public.profiles");
  assert.equal(profiles.rows.length, 0);
  const agents = await db.query("select id from public.agents");
  assert.equal(agents.rows.length, 0);

  await setAuth(db, "authenticated", OWNER);
  const mine = await db.query("select slug from public.agents order by slug");
  assert.deepEqual(
    (mine.rows as { slug: string }[]).map((row) => row.slug),
    ["chief", "inbox", "research", "social"],
  );
  await assert.rejects(db.query("insert into public.owner_allowlist (github_login) values ('octocat')"));
  await db.close();
});

test("approvals cannot be updated directly, and the service role cannot decide them", async () => {
  const db = await createTestDb();
  await seedOwner(db);
  await asSuper(db);
  const agent = await db.query<{ id: string }>("select id from public.agents where slug = 'social'");
  const thread = await db.query<{ id: string }>(
    "insert into public.threads (owner_id, agent_id, title) values ($1, $2, 'chat') returning id",
    [OWNER, agent.rows[0].id],
  );
  const run = await db.query<{ id: string }>(
    "insert into public.runs (owner_id, thread_id, agent_id, status, use_case, goal) values ($1, $2, $3, 'waiting_approval', 'chat', 'post') returning id",
    [OWNER, thread.rows[0].id, agent.rows[0].id],
  );
  const approval = await db.query<{ id: string }>(
    `insert into public.approvals
      (owner_id, run_id, agent_id, tool_call_id, tool_name, action, exact_content, args, content_hash, status, expires_at)
     values ($1, $2, $3, 'call-1', 'zernio_post', 'Publish this exact post', 'Hello', '{"content":"Hello"}'::jsonb, 'abc123', 'pending', '2026-11-07T20:00:00Z')
     returning id`,
    [OWNER, run.rows[0].id, agent.rows[0].id],
  );
  const id = approval.rows[0].id;

  await setAuth(db, "authenticated", OWNER);
  await assert.rejects(db.query("update public.approvals set status = 'approved' where id = $1", [id]));

  await setAuth(db, "service_role");
  await assert.rejects(db.query("update public.approvals set status = 'approved' where id = $1", [id]));
  await assert.rejects(
    db.query("select public.decide_approval($1, 'approved', 'abc123', 'k1', null, now())", [id]),
    /not allowed/,
  );

  await setAuth(db, "authenticated", OWNER);
  const decided = await db.query<{ decide_approval: { replay: boolean; status: string } }>(
    "select public.decide_approval($1, 'approved', 'abc123', 'k1', null, '2026-11-07T18:00:00Z') as decide_approval",
    [id],
  );
  assert.equal(decided.rows[0].decide_approval.replay, false);
  const replay = await db.query<{ decide_approval: { replay: boolean; decision: string } }>(
    "select public.decide_approval($1, 'approved', 'abc123', 'k1', null, '2026-11-07T18:00:00Z') as decide_approval",
    [id],
  );
  assert.equal(replay.rows[0].decide_approval.replay, true);
  assert.equal(replay.rows[0].decide_approval.decision, "approved");
  await assert.rejects(
    db.query("select public.decide_approval($1, 'denied', 'abc123', 'k2', null, '2026-11-07T18:00:00Z')", [id]),
    /conflict/,
  );
  await assert.rejects(
    db.query("select public.begin_consume($1, 'abc123', now())", [id]),
  );

  await setAuth(db, "service_role");
  const begun = await db.query<{ begin_consume: { action: string } }>(
    "select public.begin_consume($1, 'abc123', '2026-11-07T18:05:00Z') as begin_consume",
    [id],
  );
  assert.equal(begun.rows[0].begin_consume.action, "execute");
  const second = await db.query<{ begin_consume: { action: string; inFlight: boolean } }>(
    "select public.begin_consume($1, 'abc123', '2026-11-07T18:05:00Z') as begin_consume",
    [id],
  );
  assert.equal(second.rows[0].begin_consume.action, "replay");
  assert.equal(second.rows[0].begin_consume.inFlight, true);
  await db.query("select public.finish_consume($1, '{\"published\":true}'::jsonb, '2026-11-07T18:06:00Z')", [id]);
  const finished = await db.query<{ begin_consume: { action: string; output: { published: boolean } } }>(
    "select public.begin_consume($1, 'abc123', '2026-11-07T18:06:00Z') as begin_consume",
    [id],
  );
  assert.equal(finished.rows[0].begin_consume.action, "replay");
  assert.equal(finished.rows[0].begin_consume.output.published, true);

  await asSuper(db);
  const status = await db.query<{ status: string }>("select status from public.approvals where id = $1", [id]);
  assert.equal(status.rows[0].status, "consumed");
  await db.close();
});

test("a hash mismatch and an expired approval are refused", async () => {
  const db = await createTestDb();
  await seedOwner(db);
  await asSuper(db);
  const agent = await db.query<{ id: string }>("select id from public.agents where slug = 'chief'");
  const thread = await db.query<{ id: string }>(
    "insert into public.threads (owner_id, agent_id) values ($1, $2) returning id",
    [OWNER, agent.rows[0].id],
  );
  const run = await db.query<{ id: string }>(
    "insert into public.runs (owner_id, thread_id, agent_id, status, use_case) values ($1, $2, $3, 'waiting_approval', 'chat') returning id",
    [OWNER, thread.rows[0].id, agent.rows[0].id],
  );
  const approval = await db.query<{ id: string }>(
    `insert into public.approvals
      (owner_id, run_id, agent_id, tool_call_id, tool_name, action, args, content_hash, status, expires_at)
     values ($1, $2, $3, 'c', 'composio_write', 'Run it', '{}'::jsonb, 'hash-1', 'pending', '2026-11-07T18:30:00Z')
     returning id`,
    [OWNER, run.rows[0].id, agent.rows[0].id],
  );
  await setAuth(db, "authenticated", OWNER);
  await assert.rejects(
    db.query("select public.decide_approval($1, 'approved', 'other-hash', 'k', null, '2026-11-07T18:00:00Z')", [approval.rows[0].id]),
    /hash mismatch/,
  );
  const expired = await db.query<{ decide_approval: { error?: string; status?: string } }>(
    "select public.decide_approval($1, 'approved', 'hash-1', 'k', null, '2026-11-07T19:00:00Z') as decide_approval",
    [approval.rows[0].id],
  );
  assert.equal(expired.rows[0].decide_approval.error, "expired");
  await asSuper(db);
  const status = await db.query<{ status: string }>("select status from public.approvals where id = $1", [approval.rows[0].id]);
  assert.equal(status.rows[0].status, "expired");
  await db.close();
});

test("claiming due routines is idempotent for the same slot", async () => {
  const db = await createTestDb();
  await seedOwner(db);
  await asSuper(db);
  const agent = await db.query<{ id: string }>("select id from public.agents where slug = 'research'");
  await db.query(
    `insert into public.routines (owner_id, agent_id, name, prompt, cadence, timezone, next_run_at)
     values ($1, $2, 'Morning', 'Check the news', '{"kind":"daily_at","hour":9,"minute":0}'::jsonb, 'America/Los_Angeles', '2026-11-07T17:00:00Z')`,
    [OWNER, agent.rows[0].id],
  );
  await setAuth(db, "service_role");
  const first = await db.query("select * from public.claim_due_routines('2026-11-07T17:05:00Z')");
  assert.equal(first.rows.length, 1);
  const second = await db.query("select * from public.claim_due_routines('2026-11-07T17:05:00Z')");
  assert.equal(second.rows.length, 0);
  const dispatches = await db.query("select id from public.routine_dispatches");
  assert.equal(dispatches.rows.length, 1);
  const stuck = await db.query("select * from public.list_stuck_routines('2026-11-07T17:05:00Z')");
  assert.equal(stuck.rows.length, 1);

  await setAuth(db, "authenticated", OWNER);
  await assert.rejects(db.query("select * from public.claim_due_routines(now())"));

  await asSuper(db);
  await db.query(
    "insert into public.webhook_events (source, event_id, payload) values ('zernio', 'evt-1', '{}'::jsonb)",
  );
  await assert.rejects(
    db.query("insert into public.webhook_events (source, event_id, payload) values ('zernio', 'evt-1', '{}'::jsonb)"),
    /duplicate|unique/i,
  );
  await db.close();
});
