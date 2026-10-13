const { PLANS } = require('../config/constants');
const paymentService = require('../services/paymentService');
const paymentModel = require('../models/paymentModel');
const userModel = require('../models/userModel');

module.exports = (bot) => {
  // ============================================================
  // COMANDO /plans — Mostrar planes con botones
  // ============================================================
  bot.command('plans', async (ctx) => {
    const user = ctx.state.user;
    const currentPlan = PLANS[user.plan] || PLANS.free;

    const lines = Object.values(PLANS)
      .filter((p) => p.priceStars > 0)
      .map((p) => {
        return (
          `*${p.label}* — ${p.priceStars} ⭐\n` +
          `   📢 Canales: ${p.maxChannels}\n` +
          `   📝 Publicaciones: ${p.maxSchedules}\n` +
          `   🎯 Destinos/post: ${p.maxTargetsPerSchedule}\n` +
          `   ⏱ Duración: ${p.durationDays} días`
        );
      });

    const keyboard = Object.values(PLANS)
      .filter((p) => p.priceStars > 0)
      .map((p) => [
        {
          text: `${p.label} — ${p.priceStars} ⭐`,
          callback_data: `buy:${p.name}`,
        },
      ]);

    // Botón para ver historial de compras
    keyboard.push([{ text: '📜 Mis compras', callback_data: 'pay:history' }]);

    return ctx.reply(
      `💼 *Planes disponibles*\n\n` +
        `Tu plan actual: ${currentPlan.label}\n\n` +
        lines.join('\n\n') +
        `\n\n_El pago se realiza con Telegram Stars, la moneda interna de Telegram._`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      }
    );
  });

  // ============================================================
  // CALLBACK: Seleccionar plan para comprar
  // ============================================================
  bot.action(/^buy:(.+)$/, async (ctx) => {
    const planName = ctx.match[1];
    const userId = ctx.state.user.id;

    await ctx.answerCbQuery();

    if (!paymentService.isValidPlan(planName)) {
      return ctx.reply('❌ Plan no válido.');
    }

    const plan = PLANS[planName];
    const payload = paymentService.buildPayload(planName, userId);

    try {
      // Enviar factura con Telegram Stars
      // provider_token se deja vacío para pagos con Stars
      await ctx.telegram.sendInvoice(ctx.chat.id, {
        title: plan.label,
        description:
          `Suscripción ${plan.durationDays} días\n` +
          `📢 Canales: ${plan.maxChannels}\n` +
          `📝 Publicaciones: ${plan.maxSchedules}`,
        payload,
        provider_token: '',   // ⬅️ IMPORTANTE: vacío para Stars
        currency: 'XTR',      // ⬅️ Telegram Stars
        prices: [{ label: plan.label, amount: plan.priceStars }],
        start_parameter: 'buy_plan',
      });
    } catch (err) {
      console.error('❌ Error enviando factura:', err.message);
      return ctx.reply('❌ No pude generar la factura. Inténtalo más tarde.');
    }
  });

  // ============================================================
  // PRE-CHECKOUT: Telegram pide confirmación (límite: 10 segundos)
  // ============================================================
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      const query = ctx.preCheckoutQuery;
      const { planName, userId } = paymentService.parsePayload(
        query.invoice_payload
      );

      // Validaciones rápidas (no consultas lentas aquí)
      if (!paymentService.isValidPlan(planName)) {
        return ctx.answerPreCheckoutQuery(false, 'Plan no válido.');
      }

      if (userId !== query.from.id) {
        return ctx.answerPreCheckoutQuery(false, 'Usuario no coincide.');
      }

      const plan = PLANS[planName];
      if (query.total_amount !== plan.priceStars) {
        return ctx.answerPreCheckoutQuery(false, 'Precio incorrecto.');
      }

      // Todo OK
      return ctx.answerPreCheckoutQuery(true);
    } catch (err) {
      console.error('❌ Error en pre_checkout:', err.message);
      return ctx.answerPreCheckoutQuery(false, 'Error procesando el pago.');
    }
  });

  // ============================================================
  // SUCCESSFUL PAYMENT: Confirmación final y aplicar plan
  // ============================================================
  bot.on('message', async (ctx, next) => {
    const payment = ctx.message?.successful_payment;
    if (!payment) return next();

    try {
      const { planName, userId } = paymentService.parsePayload(
        payment.invoice_payload
      );

      // Evitar duplicados (si Telegram reenvía el update)
      const existing = paymentModel.findByChargeId(
        payment.telegram_payment_charge_id
      );
      if (existing) {
        return ctx.reply('✅ Este pago ya fue procesado.');
      }

      const result = paymentService.applyPayment({
        userId,
        planName,
        chargeId: payment.telegram_payment_charge_id,
        amountStars: payment.total_amount,
      });

      return ctx.reply(
        `🎉 *¡Pago completado!*\n\n` +
          `Plan activado: ${PLANS[result.planName].label}\n` +
          `Válido hasta: ${result.expiresAt.toLocaleDateString()}\n` +
          `Stars: ${payment.total_amount} ⭐\n\n` +
          `Usa /me para ver tu plan actualizado.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('❌ Error aplicando pago:', err.message);
      return ctx.reply(
        '⚠️ El pago se procesó pero hubo un error al activar el plan. ' +
          'Contacta al administrador con este ID: ' +
          payment.telegram_payment_charge_id
      );
    }
  });

  // ============================================================
  // CALLBACK: Historial de compras
  // ============================================================
  bot.action('pay:history', async (ctx) => {
    const payments = paymentModel.getByUser(ctx.state.user.id);
    await ctx.answerCbQuery();

    if (!payments.length) {
      return ctx.editMessageText('📭 No tienes compras registradas.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Volver', callback_data: 'pay:back' }],
          ],
        },
      });
    }

    const text =
      `📜 *Tu historial de compras*\n\n` +
      payments
        .map(
          (p) =>
            `• ${PLANS[p.plan]?.label || p.plan} — ${p.amount} ⭐\n` +
            `  ${new Date(p.created_at).toLocaleString()}`
        )
        .join('\n\n');

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Volver', callback_data: 'pay:back' }]],
      },
    });
  });

  // ============================================================
  // CALLBACK: Volver a /plans
  // ============================================================
  bot.action('pay:back', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.deleteMessage().then(() => {
      // Simplemente pedimos al usuario que re-ejecute /plans
      return ctx.reply('Usa /plans para ver los planes de nuevo.');
    });
  });
};