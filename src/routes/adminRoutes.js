const { 
  listAccessLogs,
  listWhitelist,
  addToWhitelist,
  addUserIpWhitelist,
  listUserIpWhitelist,
  sendAdminTestEmail        // 👈 nuevo
} = require('../controllers/adminController');

// ...

// test de correo (requiere x-admin-key)
router.post('/test-email', sendAdminTestEmail);
