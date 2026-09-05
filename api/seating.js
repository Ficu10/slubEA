const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;
const KEY = 'seating.json';

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!BUCKET) return res.status(500).json({ error: 'missing_r2_env' });

  try {
    if (req.method === 'GET') {
      // try read from R2
      try{
        const cmd = new GetObjectCommand({ Bucket: BUCKET, Key });
        const out = await s3.send(cmd);
        const stream = out.Body;
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const body = Buffer.concat(chunks).toString('utf8');
        const json = JSON.parse(body);
        return res.status(200).json(json);
      }catch(e){
        // fallback to bundled file on filesystem
        try{
          const fs = require('fs');
          const path = require('path');
          const file = path.join(__dirname, '..', 'data', 'seating.json');
          const body = fs.readFileSync(file, 'utf8');
          return res.status(200).json(JSON.parse(body));
        }catch(err){
          console.error('seating get error', err);
          return res.status(500).json({ error: 'read_failed' });
        }
      }
    }

    if (req.method === 'POST'){
      // accept JSON body with { positions, assignments }
      const payload = req.body || (await new Promise(r => {
        let data=''; req.on('data',c=>data+=c); req.on('end',()=>r(JSON.parse(data||'{}')));
      }));
      const body = JSON.stringify(payload, null, 2);
      const cmd = new PutObjectCommand({ Bucket: BUCKET, Key, Body: body, ContentType: 'application/json' });
      await s3.send(cmd);
      return res.status(200).json({ success:true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('seating handler error', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
};
