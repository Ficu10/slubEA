const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');

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

// seating persistent storage
const DATA_DIR = path.join(__dirname, 'data');
const SEATING_FILE = path.join(DATA_DIR, 'seating.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
// ensure seating file exists
if (!fs.existsSync(SEATING_FILE)) {
  const defaultSeating = { positions: [], assignments: {} };
  fs.writeFileSync(SEATING_FILE, JSON.stringify(defaultSeating, null, 2));
}

app.post('/api/upload', upload.array('files', 50), (req, res) => {
  const files = (req.files || []).map(f => ({ name: path.basename(f.path), url: `/uploads/${path.basename(f.path)}` }));
  res.json({ success: true, files });
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

app.get('/api/files', (req, res) => {
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
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
