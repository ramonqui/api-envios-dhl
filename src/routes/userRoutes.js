const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const {
  listUsers,
  getUser,
  updateUserData,
  deactivateUserById
} = require('../controllers/userController');

const router = express.Router();

// Todas requieren estar logueado + ser ADMIN
router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

// GET /api/users
router.get('/', listUsers);

// GET /api/users/:id
router.get('/:id', getUser);

// PUT /api/users/:id
router.put('/:id', updateUserData);

// DELETE /api/users/:id
router.delete('/:id', deactivateUserById);

module.exports = router;
