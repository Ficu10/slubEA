const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { filename, contentType } = req.body || {};
    if (!filename) return res.status(400).json({ error: 'missing filename' });
    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `uploads/${Date.now()}-${safeName}`;
    const cmd = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ url, key }));
  } catch (err) {
    console.error('sign-url error', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
