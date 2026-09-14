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
const KEY = 'site-content.json';

const defaultContent = {
  schedule: [
    { time: '13:00', label: 'Ślub' },
    { time: '14:00', label: 'Życzenia' },
    { time: '15:00', label: 'Pierwszy taniec' },
    { time: '16:00', label: 'Obiad' },
    { time: '17:00', label: 'Zdjęcia' },
    { time: '18:00', label: 'Tort' },
    { time: '19:00', label: 'Kolacja I' },
    { time: '20:00', label: 'Zimne ognie' },
    { time: '22:00', label: 'Kolacja II' },
    { time: '24:00', label: 'Oczepiny' },
    { time: '02:30', label: 'Kolacja III' },
    { time: '05:00', label: 'Koniec imprezy' }
  ],
  menu: [
    { title: 'Obiad', text: 'rosół, kotlet drobiowy, ziemniaki, surówki' },
    { title: 'Dania ciepłe', text: 'barszcz z pasztecikiem, żurek, bogracz' },
    { title: 'Zimna płyta', text: 'wędliny, sery, sałatki, pieczywo' },
    { title: 'Desery', text: 'tort weselny, ciasta, owoce' },
    { title: 'Napoje', text: 'kawa, herbata, soki, woda' }
  ]
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function hasAdminToken(req) {
  const authorization = String(req.headers.authorization || '');
  return authorization.startsWith('Bearer ') && authorization.slice(7).trim().length > 0;
}

async function readContent() {
  try {
    const output = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
    const chunks = [];
    for await (const chunk of output.Body) chunks.push(chunk);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return {
      schedule: Array.isArray(parsed.schedule) && parsed.schedule.length ? parsed.schedule : defaultContent.schedule,
      menu: Array.isArray(parsed.menu) && parsed.menu.length ? parsed.menu : defaultContent.menu
    };
  } catch (_) {
    return defaultContent;
  }
}

module.exports = async function (req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!BUCKET) return res.status(500).json({ error: 'missing_r2_env' });

  try {
    if (req.method === 'GET') return res.status(200).json(await readContent());
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (!hasAdminToken(req)) return res.status(403).json({ error: 'forbidden' });

    const payload = req.body || {};
    const content = {
      schedule: Array.isArray(payload.schedule) ? payload.schedule : defaultContent.schedule,
      menu: Array.isArray(payload.menu) ? payload.menu : defaultContent.menu
    };
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
      Body: JSON.stringify(content, null, 2),
      ContentType: 'application/json'
    }));
    return res.status(200).json({ success: true, content });
  } catch (err) {
    console.error('site content error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
};
