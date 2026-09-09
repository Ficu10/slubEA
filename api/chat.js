const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
});
const KEY = 'chat/messages.json';

function cors(res){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization'); }
async function readMessages(){
  try{
    const out = await s3.send(new GetObjectCommand({Bucket:process.env.R2_BUCKET_NAME,Key:KEY}));
    const chunks=[]; for await (const chunk of out.Body) chunks.push(chunk);
    const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')); return Array.isArray(parsed.messages)?parsed.messages:[];
  }catch(_){ return []; }
}
module.exports = async function(req,res){
  cors(res); if(req.method==='OPTIONS') return res.status(200).end();
  if(!process.env.R2_BUCKET_NAME) return res.status(500).json({error:'missing_r2_env'});
  try{
    const messages=await readMessages();
    if(req.method==='GET') return res.status(200).json({messages});
    if(req.method==='DELETE'){
      const auth = String(req.headers.authorization || '');
      if(!auth.startsWith('Bearer ') || !auth.slice(7).trim()) return res.status(403).json({error:'forbidden'});
      const createdAt = String((req.body||{}).createdAt || '').trim();
      if(!createdAt) return res.status(400).json({error:'missing_createdAt'});
      const remaining = messages.filter(item => item.createdAt !== createdAt);
      if(remaining.length === messages.length) return res.status(404).json({error:'not_found'});
      await s3.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET_NAME,Key:KEY,Body:JSON.stringify({messages:remaining},null,2),ContentType:'application/json'}));
      return res.status(200).json({success:true});
    }
    if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
    const author=String((req.body||{}).author||'').trim(); const message=String((req.body||{}).message||'').trim();
    if(!author||!message) return res.status(400).json({error:'missing_fields'});
    messages.push({author:author.slice(0,120),message:message.slice(0,500),createdAt:new Date().toISOString()});
    const limited=messages.slice(-200);
    await s3.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET_NAME,Key:KEY,Body:JSON.stringify({messages:limited},null,2),ContentType:'application/json'}));
    return res.status(200).json({success:true});
  }catch(err){ console.error('chat error',err); return res.status(500).json({error:'internal_error'}); }
};
