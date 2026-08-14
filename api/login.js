const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const contentType = req.headers['content-type'] || '';
  let user, pass;
  if (contentType.includes('application/x-www-form-urlencoded')){
    // body should be parsed by Vercel - but ensure we can read
    user = req.body && req.body.user;
    pass = req.body && req.body.pass;
  } else {
    // try JSON
    user = req.body && req.body.user;
    pass = req.body && req.body.pass;
  }

  if (!user || !pass) return res.status(400).json({ error: 'missing' });
  // simple static credentials
  if (user === 'adas' && pass === 'emilka'){
    const secret = process.env.ADMIN_SECRET || 'dev_secret_change_me';
    const token = jwt.sign({ user }, secret, { expiresIn: '7d' });
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false });
};
