const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const key = req.query.key || '';
    if (!key) return res.status(400).json({ error: 'missing_key' });
    if (!process.env.R2_BUCKET_NAME) return res.status(500).json({ error: 'missing_r2_env' });
    const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
    const data = await s3.send(cmd);
    const contentType = (data.ContentType) || 'application/octet-stream';
    if (data.ContentLength) res.setHeader('Content-Length', String(data.ContentLength));
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // stream body to response
    const body = data.Body;
    if (body && typeof body.pipe === 'function') {
      body.pipe(res);
    } else {
      // fallback when body is a buffer
      res.end(Buffer.from(await streamToBuffer(body)));
    }
  } catch (err) {
    if (err.name === 'NoSuchKey' || /NotFound|NoSuchKey/i.test(err.message)) return res.status(404).end('NOT_FOUND');
    console.error('zdjecia error', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
};

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on && stream.on('data', (c) => chunks.push(c));
    stream.on && stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on && stream.on('error', reject);
  });
}
