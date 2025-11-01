const {
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser
} = require('../models/userModel');

async function listUsers(req, res) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const users = await getAllUsers(limit);

    return res.json({
      status: 'ok',
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Error listando usuarios:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudieron obtener los usuarios',
      error: error.message
    });
  }
}

async function getUser(req, res) {
  try {
    const { id } = req.params;
    const user = await getUserById(id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Usuario no encontrado'
      });
    }

    return res.json({
      status: 'ok',
      data: user
    });
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo obtener el usuario',
      error: error.message
    });
  }
}

async function updateUserData(req, res) {
  try {
    const { id } = req.params;
    const { nombre, apellido, whatsapp, negocio_url, rol, is_active } = req.body;

    const updated = await updateUser(id, {
      nombre,
      apellido,
      whatsapp,
      negocio_url,
      rol,
      is_active
    });

    if (!updated) {
      return res.status(400).json({
        status: 'error',
        message: 'No se pudo actualizar el usuario (revisa los datos enviados).'
      });
    }

    const user = await getUserById(id);

    return res.json({
      status: 'ok',
      message: 'Usuario actualizado correctamente.',
      data: user
    });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo actualizar el usuario',
      error: error.message
    });
  }
}

async function deactivateUserById(req, res) {
  try {
    const { id } = req.params;

    const deactivated = await deactivateUser(id);

    if (!deactivated) {
      return res.status(404).json({
        status: 'error',
        message: 'Usuario no encontrado o ya estaba desactivado.'
      });
    }

    return res.json({
      status: 'ok',
      message: 'Usuario desactivado correctamente.'
    });
  } catch (error) {
    console.error('Error desactivando usuario:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo desactivar el usuario',
      error: error.message
    });
  }
}

module.exports = {
  listUsers,
  getUser,
  updateUserData,
  deactivateUserById
};
