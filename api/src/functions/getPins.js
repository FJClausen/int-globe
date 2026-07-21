const { app } = require('@azure/functions');
const { getPool } = require('./db');

app.http('getPins', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'pins',
  handler: async (req, ctx) => {
    try {
      const pool = await getPool();
      const type = req.query.get('type');
      const result = await (type
        ? pool.request().input('t', type)
            .query('SELECT id,pin_type,title,story,lat,lng,country,author_id,author_name,created_at FROM pins WHERE pin_type=@t ORDER BY created_at DESC')
        : pool.request()
            .query('SELECT id,pin_type,title,story,lat,lng,country,author_id,author_name,created_at FROM pins ORDER BY created_at DESC'));
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result.recordset) };
    } catch (e) {
      ctx.error(e);
      return { status: 500, body: JSON.stringify({ error: 'Failed to fetch pins' }) };
    }
  },
});
