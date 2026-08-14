const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'dev_secret_change_me';

const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

async function readSeating(){
  if (!supabase) return { positions: [], assignments: {} };
  const { data, error } = await supabase.storage.from('data').download('seating.json');
  if (error) return { positions: [], assignments: {} };
  const arr = await data.arrayBuffer();
  try { return JSON.parse(Buffer.from(arr).toString()); }
  catch(e){ return { positions: [], assignments: {} }; }
}

async function writeSeating(obj){
  if (!supabase) return false;
  const buf = Buffer.from(JSON.stringify(obj));
  const { error } = await supabase.storage.from('data').upload('seating.json', buf, { upsert: true, contentType: 'application/json' });
  return !error;
}

module.exports = async (req, res) => {
  if (req.method === 'GET'){
    const obj = await readSeating();
    return res.json(obj);
  }
  if (req.method === 'POST'){
    const auth = (req.headers.authorization||'').split(' ');
    const token = auth.length===2 && auth[0]==='Bearer' ? auth[1] : null;
    if (!token) return res.status(403).json({ error: 'forbidden' });
    try{ jwt.verify(token, ADMIN_SECRET); } catch(e){ return res.status(403).json({ error: 'forbidden' }); }
    const body = req.body || {};
    const ok = await writeSeating(body);
    if (ok) return res.json({ success: true });
    return res.status(500).json({ error: 'unable to save' });
  }
  res.status(405).json({ error: 'method' });
};
