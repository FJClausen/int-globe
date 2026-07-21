const { app } = require('@azure/functions');
const { getPool, sql } = require('./db');

function getUser(req) {
  const h = req.headers.get('x-ms-client-principal');
  if (!h) return null;
  try {
    const o = JSON.parse(Buffer.from(h, 'base64').toString());
    const name = (o.claims || []).find(c => c.typ === 'name') ||
                 (o.claims || []).find(c => c.typ === 'preferred_username');
    return { id: o.userId || o.userDetails, name: name?.val || o.userDetails || 'Unknown' };
  } catch { return null; }
}

app.http('upsertPin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'pins',
  handler: async (req, ctx) => {
    const user = getUser(req);
    if (!user) return { status: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    try {
      const { pin_type, title, story, lat, lng, country } = await req.json();
      if (!pin_type || !title || lat == null || lng == null)
        return { status: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
      if (!['personal', 'mission'].includes(pin_type))
        return { status: 400, body: JSON.stringify({ error: 'Invalid pin_type' }) };
      const pool = await getPool();
      const r = await pool.request()
        .input('pt', sql.NVarChar(20),       pin_type)
        .input('ti', sql.NVarChar(200),      title)
        .input('st', sql.NVarChar(sql.MAX),  story || '')
        .input('la', sql.Decimal(9, 6),      lat)
        .input('lo', sql.Decimal(9, 6),      lng)
        .input('co', sql.NVarChar(100),      country || '')
        .input('ai', sql.NVarChar(200),      user.id)
        .input('an', sql.NVarChar(200),      user.name)
        .query('INSERT INTO pins(pin_type,title,story,lat,lng,country,author_id,author_name) OUTPUT INSERTED.* VALUES(@pt,@ti,@st,@la,@lo,@co,@ai,@an)');
      return { status: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.recordset[0]) };
    } catch (e) {
      ctx.error(e);
      return { status: 500, body: JSON.stringify({ error: 'Failed to save pin' }) };
    }
  },
});
