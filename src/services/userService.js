const userModel = require('../models/userModel');

module.exports = {
  /**
   * Devuelve el usuario o lo crea si no existe.
   */
  getOrCreate(from) {
    let user = userModel.findById(from.id);
    if (!user) {
      user = userModel.create({
        id: from.id,
        username: from.username,
        firstName: from.first_name,
      });
    } else {
      // refrescar username / first_name por si cambiaron
      userModel.create({
        id: from.id,
        username: from.username,
        firstName: from.first_name,
      });
      user = userModel.findById(from.id);
    }
    return user;
  },

  getUser(userId) {
    return userModel.findById(userId);
  },
};