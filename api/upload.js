const Busboy = require('busboy');
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!supabase) return res.status(500).json({ error: 'no-supabase' });

  const busboy = new Busboy({ headers: req.headers });
  const uploads = [];
  const results = [];

  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    const chunks = [];
    file.on('data', (data) => chunks.push(data));
    file.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const safe = filename.replace(/\s+/g, '_');
      const path = `${Date.now()}_${safe}`;
      const p = (async () => {
        const { error } = await supabase.storage.from('uploads').upload(path, buffer, { contentType: mimetype, upsert: false });
        if (error){ results.push({ name: filename, error: error.message }); return; }
        const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path);
        results.push({ name: path, url: urlData.publicUrl });
      })();
      uploads.push(p);
    });
  });

  busboy.on('finish', async () => {
    await Promise.all(uploads);
    res.json({ success: true, files: results });
  });

  req.pipe(busboy);
};
