const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const storage = multer.memoryStorage();
const upload = multer({ storage }).single('file');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function setCors(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function (req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  if (!process.env.R2_BUCKET_NAME || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: 'missing_r2_env', message: 'R2 env vars not configured' });
  }

  upload(req, res, async function (err) {
    try {
      if (err) {
        console.error('multer error', err);
        return res.status(400).json({ error: 'invalid_form', message: err.message });
      }
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'missing_file' });

      const origName = file.originalname || 'file';
      const safeName = String(origName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `uploads/${Date.now()}-${safeName}`;

      const cmd = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
      });

      await s3.send(cmd);

      // Try to return a signed GET URL for immediate preview (falls back to key only)
      try {
        const getCmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
        const url = await getSignedUrl(s3, getCmd, { expiresIn: 3600 });
        return res.status(200).json({ key, url });
      } catch (e) {
        console.error('could not generate get-url', e);
        return res.status(200).json({ key });
      }
    } catch (err) {
      console.error('upload error', err);
      return res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });
};
