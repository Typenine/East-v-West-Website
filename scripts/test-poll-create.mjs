import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const polls = await client.query('SELECT id, title, status, created_at FROM polls ORDER BY created_at DESC LIMIT 10');
console.log('Existing polls:', polls.rows);

const types = await client.query(`SELECT unnest(enum_range(NULL::question_type))::text AS t`);
console.log('question_type enum:', types.rows.map((r) => r.t));

try {
  const ins = await client.query(`
    INSERT INTO polls (title, eligibility_type, anonymous, result_visibility)
    VALUES ('Test poll script', 'team', false, 'admin_publish')
    RETURNING id, title, status
  `);
  console.log('Insert poll ok:', ins.rows[0]);
  const pollId = ins.rows[0].id;
  const q = await client.query(`
    INSERT INTO poll_questions (poll_id, question_type, text, display_order)
    VALUES ($1, 'yes_no'::question_type, 'Do you agree?', 0)
    RETURNING id, question_type, text
  `, [pollId]);
  console.log('Insert question ok:', q.rows[0]);
  await client.query('DELETE FROM polls WHERE id = $1', [pollId]);
  console.log('Cleaned up test poll');
} catch (e) {
  console.error('Insert test failed:', e.message);
}

await client.end();
