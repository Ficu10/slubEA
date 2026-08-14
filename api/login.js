const jwt = require('jsonwebtoken');
const { StringDecoder } = require('string_decoder');

function parseBodyRaw(req){
  return new Promise((resolve, reject)=>{
    let data = '';
    const decoder = new StringDecoder('utf8');
    req.on('data', chunk => { data += decoder.write(chunk); });
    req.on('end', () => { data += decoder.end(); resolve(data); });
    req.on('error', reject);
  });
}

function parseForm(body){
  try{
    const params = new URLSearchParams(body);
    const obj = {};
    for (const [k,v] of params.entries()) obj[k]=v;
    return obj;
  }catch(e){ return {}; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  let bodyObj = req.body || {};

  if (!bodyObj || Object.keys(bodyObj).length===0) {
    // try to read raw body
    const raw = await parseBodyRaw(req).catch(()=>'');
    if (contentType.includes('application/x-www-form-urlencoded')) bodyObj = parseForm(raw);
    else if (contentType.includes('application/json')){
      try{ bodyObj = raw ? JSON.parse(raw) : {}; } catch(e){ bodyObj = {}; }
    }
  }

  const user = (bodyObj.user || '').toString().trim();
  const pass = (bodyObj.pass || '').toString().trim();

  if (!user || !pass) return res.status(400).json({ error: 'missing' });
  if (user === 'adas' && pass === 'emilka'){
    const secret = process.env.ADMIN_SECRET || 'dev_secret_change_me';
    const token = jwt.sign({ user }, secret, { expiresIn: '7d' });
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false });
};
