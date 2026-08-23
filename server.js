const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const { google } = require('googleapis');
const { Storage } = require('@google-cloud/storage');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safe = file.originalname.replace(/\s+/g, '_');
    cb(null, `${timestamp}_${safe}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype) || /^video\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported file type'), false);
  }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// Google Drive helpers
function getAuthClient(){
  const keyFile = process.env.GOOGLE_SERVICE_KEY_FILE;
  if (keyFile && fs.existsSync(keyFile)) {
    return new google.auth.GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/drive'] });
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw){
    // accept either raw JSON or base64 encoded
    try {
      const maybe = raw.trim();
      let creds;
      if (maybe.startsWith('{')) creds = JSON.parse(maybe);
      else creds = JSON.parse(Buffer.from(maybe, 'base64').toString('utf8'));
      return new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive'] });
    } catch(e){
      throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON');
    }
  }
  return null;
}

// Google Cloud Storage helpers
function getStorageClient(){
  const keyFile = process.env.GOOGLE_SERVICE_KEY_FILE;
  if (keyFile && fs.existsSync(keyFile)) return new Storage({ keyFilename: keyFile });
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw){
    try{
      const maybe = raw.trim();
      const creds = maybe.startsWith('{') ? JSON.parse(maybe) : JSON.parse(Buffer.from(maybe, 'base64').toString('utf8'));
      return new Storage({ credentials: creds });
    }catch(e){ throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON for GCS'); }
  }
  return new Storage(); // use default credentials (Cloud Run)
}

async function uploadToGCS(localPath, destName, contentType, bucketName){
  const storage = getStorageClient();
  const bucket = storage.bucket(bucketName);
  await bucket.upload(localPath, { destination: destName, metadata: { contentType } });
  try{ await bucket.file(destName).makePublic(); }catch(e){}
  try{ fs.unlinkSync(localPath); }catch(e){}
  return { url: `https://storage.googleapis.com/${bucketName}/${destName}` };
}

async function listGCSFiles(bucketName){
  const storage = getStorageClient();
  const [files] = await storage.bucket(bucketName).getFiles();
  return files.map(f => ({ name: f.name, url: `https://storage.googleapis.com/${bucketName}/${f.name}`, type: (f.metadata && f.metadata.contentType && f.metadata.contentType.startsWith('image/')) ? 'image' : 'video' }));
}

async function uploadToDrive(localPath, fileName, mimeType, folderId){
  const auth = getAuthClient();
  if (!auth) throw new Error('No Google credentials configured');
  const client = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: client });
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: folderId ? [folderId] : undefined },
    media: { mimeType, body: fs.createReadStream(localPath) },
    fields: 'id,webViewLink'
  });
  const fileId = res.data.id;
  // make public (optional but useful for gallery)
  try {
    await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
  } catch(e){ /* ignore permission errors */ }
  try { fs.unlinkSync(localPath); } catch(e){ /* ignore */ }
  return { id: fileId, url: `https://drive.google.com/uc?export=download&id=${fileId}`, webViewLink: res.data.webViewLink };
}

async function listDriveFiles(folderId){
  const auth = getAuthClient();
  if (!auth) throw new Error('No Google credentials configured');
  const client = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: client });
  const q = `'${folderId}' in parents and trashed = false`;
  const res = await drive.files.list({ q, fields: 'files(id,name,mimeType,modifiedTime,size)', pageSize: 1000 });
  const files = res.data.files || [];
  return files.map(f => {
    let type = 'other';
    if (f.mimeType && f.mimeType.startsWith('image/')) type = 'image';
    if (f.mimeType && f.mimeType.startsWith('video/')) type = 'video';
    return { name: f.name, url: `https://drive.google.com/uc?export=download&id=${f.id}`, type };
  });
}

// seating persistent storage
const DATA_DIR = path.join(__dirname, 'data');
const SEATING_FILE = path.join(DATA_DIR, 'seating.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
// ensure seating file exists
if (!fs.existsSync(SEATING_FILE)) {
  const defaultSeating = { positions: [], assignments: {} };
  fs.writeFileSync(SEATING_FILE, JSON.stringify(defaultSeating, null, 2));
}

app.post('/api/upload', upload.array('files', 50), async (req, res, next) => {
  try {
    const gcsBucket = process.env.GCS_BUCKET_NAME || null;
    if (gcsBucket) {
      const results = [];
      for (const f of req.files || []) {
        try {
          const dest = `${Date.now()}_${f.originalname.replace(/\s+/g,'_')}`;
          const r = await uploadToGCS(f.path, dest, f.mimetype, gcsBucket);
          results.push({ name: f.originalname, url: r.url });
        } catch (e) {
          results.push({ name: f.originalname, url: `/uploads/${path.basename(f.path)}`, error: e.message });
        }
      }
      return res.json({ success: true, files: results });
    }
    const folderId = process.env.DRIVE_FOLDER_ID || null;
    if (folderId) {
      const results = [];
      for (const f of req.files || []) {
        try {
          const r = await uploadToDrive(f.path, f.originalname, f.mimetype, folderId);
          results.push({ name: f.originalname, url: r.url, webView: r.webViewLink });
        } catch (e) {
          // on failure, keep local file info
          results.push({ name: f.originalname, url: `/uploads/${path.basename(f.path)}`, error: e.message });
        }
      }
      return res.json({ success: true, files: results });
    }
    const files = (req.files || []).map(f => ({ name: path.basename(f.path), url: `/uploads/${path.basename(f.path)}` }));
    res.json({ success: true, files });
  } catch (err) { next(err); }
});

// Simple in-memory session store for admin tokens
const sessions = new Set();

app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === 'adas' && pass === 'emilka'){
    const token = require('crypto').randomBytes(24).toString('hex');
    sessions.add(token);
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false });
});

// Delete uploaded file (admin only)
app.delete('/api/files/:name', (req, res) => {
  const auth = (req.get('authorization') || '');
  const parts = auth.split(' ');
  const token = parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;
  if (!token || !sessions.has(token)) return res.status(403).json({ error: 'forbidden' });
  const name = req.params.name;
  const filePath = path.join(UPLOAD_DIR, name);
  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ error: 'unable to delete' });
    res.json({ success: true });
  });
});

// Get seating (positions + assignments)
app.get('/api/seating', (req, res) => {
  fs.readFile(SEATING_FILE, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'unable to read seating' });
    try { const obj = JSON.parse(data); return res.json(obj); }
    catch(e){ return res.status(500).json({ error: 'invalid seating data' }); }
  });
});

// Save seating (admin only)
app.post('/api/seating', (req, res) => {
  const auth = (req.get('authorization') || '');
  const parts = auth.split(' ');
  const token = parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;
  if (!token || !sessions.has(token)) return res.status(403).json({ error: 'forbidden' });
  const body = req.body || {};
  const toSave = { positions: body.positions || [], assignments: body.assignments || {} };
  fs.writeFile(SEATING_FILE, JSON.stringify(toSave, null, 2), (err) => {
    if (err) return res.status(500).json({ error: 'unable to save seating' });
    res.json({ success: true });
  });
});

app.get('/api/files', async (req, res, next) => {
  try {
    const gcsBucket = process.env.GCS_BUCKET_NAME || null;
    if (gcsBucket) {
      try {
        const items = await listGCSFiles(gcsBucket);
        return res.json(items);
      } catch (e) {
        console.error('GCS list failed:', e.message);
      }
    }
    const folderId = process.env.DRIVE_FOLDER_ID || null;
    if (folderId) {
      try {
        const items = await listDriveFiles(folderId);
        return res.json(items);
      } catch (e) {
        // fallback to local
        console.error('Drive list failed:', e.message);
      }
    }
    fs.readdir(UPLOAD_DIR, (err, files) => {
      if (err) return res.status(500).json({ error: 'unable to read uploads' });
      files = files.filter(f => !f.startsWith('.')).sort((a, b) => b.localeCompare(a));
      const items = files.map(name => {
        const ext = path.extname(name).toLowerCase();
        let type = 'other';
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        const videoExts = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.ogv'];
        if (imageExts.includes(ext)) type = 'image';
        if (videoExts.includes(ext)) type = 'video';
        return { name, url: `/uploads/${name}`, type };
      });
      res.json(items);
    });
  } catch (err) { next(err); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler - always respond with JSON for API routes
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  // If request looks like an API call, return JSON
  if (req.path.startsWith('/api') || req.xhr || req.headers.accept && req.headers.accept.indexOf('application/json') !== -1) {
    res.status(status).type('application/json').json({ error: err.message || 'Internal Server Error' });
  } else {
    // for non-API requests, send plain text or index
    res.status(status).type('text/plain').send(err.message || 'Internal Server Error');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
