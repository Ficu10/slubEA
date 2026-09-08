const crypto = require('crypto');

module.exports = function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { user, pass } = req.body || {};
  if (user !== 'emilka' || pass !== 'adas') return res.status(401).json({ success: false });

  const token = crypto.randomBytes(24).toString('hex');
  return res.status(200).json({ success: true, token });
};