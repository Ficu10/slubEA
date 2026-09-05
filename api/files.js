const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function inferTypeFromKey(key){
  const k = key.toLowerCase();
  if (k.endsWith('.mp4')||k.endsWith('.mov')||k.endsWith('.webm')||k.endsWith('.ogg')) return 'video';
  return 'image';
}

module.exports = async function (req, res){
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  if (!process.env.R2_BUCKET_NAME) return res.status(500).json({ error: 'missing_r2_env' });

  try {
    const cmd = new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, Prefix: 'uploads/', MaxKeys: 200 });
    const out = await s3.send(cmd);
    const contents = out.Contents || [];
    // sort newest first
    contents.sort((a,b)=> (b.LastModified||0) - (a.LastModified||0));

    const items = await Promise.all(contents.map(async (c)=>{
      const key = c.Key;
      const name = key.split('/').pop();
      const type = inferTypeFromKey(key);
      let url = null;
      try{
        const getCmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
        url = await getSignedUrl(s3, getCmd, { expiresIn: 3600 });
      }catch(e){ /* ignore, url stays null */ }
      return { key, name, type, url, size: c.Size, lastModified: c.LastModified };
    }));

    return res.status(200).json(items);
  } catch (err){
    console.error('files list error', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
};
