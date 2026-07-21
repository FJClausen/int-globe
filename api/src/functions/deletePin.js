const { app } = require('@azure/functions');
const { getPool, sql } = require('./db');

function getUser(req) {
  const h = req.headers.get('x-ms-client-principal');
  if (!h) return null;
  try {
    const o = JSON.parse(Buffer.from(h, 'base64').toString());
    return { id: o.userId || o.userDetails };
  } catch { return null; }
}

app.http('deletePin', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'pins/{id}',
  handler: async (req, ctx) => {
    const user = getUser(req);
    if (!user) return { status: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    try {
      const pool = await getPool();
      const r = await pool.request()
        .input('id', sql.UniqueIdentifier,  req.params.id)
        .input('ai', sql.NVarChar(200),     user.id)
        .query('DELETE FROM pins WHERE id=@id AND author_id=@ai');
      if (r.rowsAffected[0] === 0)
        return { status: 404, body: JSON.stringify({ error: 'Pin not found or not yours' }) };
      return { status: 204 };
    } catch (e) {
      ctx.error(e);
      return { status: 500, body: JSON.stringify({ error: 'Failed to delete pin' }) };
    }
  },
});
