module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }
  return res.status(200).json({
    ok:true, service:'ALICE device-chat bridge', version:'0.1.0',
    transport:'https', auth:'bearer',
    capabilities:['health','authenticated_handshake','envelope_validation','n8n_webhook_compatibility'],
    limitations:['no_chat_history_access','no_phone_control_without_device_pairing','no_persistent_inbox'],
    server_time:new Date().toISOString()
  });
}