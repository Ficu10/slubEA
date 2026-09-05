const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const storage = multer.memoryStorage();
const upload = multer({ storage }).fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 20 }]);

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

      // Collect files from either 'file' or 'files' fields
      const filesArr = [];
      if (req.files) {
        if (req.files.file) filesArr.push(...req.files.file);
        if (req.files.files) filesArr.push(...req.files.files);
      }
      // multer single might populate req.file in some contexts; include it
      if (req.file) filesArr.push(req.file);

      if (!filesArr.length) return res.status(400).json({ error: 'missing_file' });

      const results = [];
      for (const file of filesArr) {
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

        let url = null;
        try {
          const getCmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
          url = await getSignedUrl(s3, getCmd, { expiresIn: 3600 });
        } catch (e) {
          console.error('could not generate get-url', e);
        }
        results.push({ key, url, name: safeName, contentType: file.mimetype, size: file.size });
        // small pause to avoid identical timestamps for keys when multiple files
        await new Promise(r => setTimeout(r, 5));
      }

      return res.status(200).json({ success: true, files: results });
    } catch (err) {
      console.error('upload error', err);
      return res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });
};
