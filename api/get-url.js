import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const key = req.query.key || '';
    if (!key) return res.status(400).json({ error: 'missing key' });
    const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ url }));
  } catch (err) {
    console.error('get-url error', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
}
