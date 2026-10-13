const userService = require('../services/userService');

module.exports = () => async (ctx, next) => {
  if (ctx.from && !ctx.from.is_bot) {
    ctx.state.user = userService.getOrCreate(ctx.from);
  }
  return next();
};