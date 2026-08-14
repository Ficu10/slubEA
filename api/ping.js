module.exports = (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
};
