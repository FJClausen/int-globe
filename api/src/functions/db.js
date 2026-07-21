const sql = require('mssql');
let pool;
const cfg = {
  server:   process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user:     process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options:  { encrypt: true, trustServerCertificate: false },
  pool:     { max: 10, min: 0, idleTimeoutMillis: 30000 },
};
async function getPool() {
  if (!pool) pool = await sql.connect(cfg);
  return pool;
}
module.exports = { getPool, sql };
