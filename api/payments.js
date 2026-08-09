import {
  supabaseRequest
} from './lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    /*
      RANGE MODE
      /api/payments?from=1&to=5
    */

    if (
      req.query.from !== undefined ||
      req.query.to !== undefined
    ) {
      const from = Number(
        req.query.from || 1
      );

      const to = Number(
        req.query.to || from
      );

      if (
        !Number.isInteger(from) ||
        !Number.isInteger(to) ||
        from < 1 ||
        to > 38 ||
        from > to
      ) {
        return res.status(400).json({
          error: 'Invalid Gameweek range'
        });
      }

      const payments =
        await supabaseRequest(
          `payments` +
          `?gameweek=gte.${from}` +
          `&gameweek=lte.${to}` +
          `&select=id,gameweek,entry_id,paid,winner,paid_at,updated_at` +
          `&order=gameweek.desc,entry_id.asc`
        );

      return res.status(200).json({
        from,
        to,

        fee: Number(
          process.env.GW_ENTRY_FEE || 0
        ),

        zelle:
          process.env.ZELLE_DISPLAY || '',

        payments:
          Array.isArray(payments)
            ? payments
            : [],

        updatedAt:
          new Date().toISOString()
      });
    }

    /*
      SINGLE GW MODE
    */

    const gameweek =
      Number(req.query.gw || 1);

    if (
      !Number.isInteger(gameweek) ||
      gameweek < 1 ||
      gameweek > 38
    ) {
      return res.status(400).json({
        error: 'Invalid Gameweek'
      });
    }

    const payments =
      await supabaseRequest(
        `payments` +
        `?gameweek=eq.${gameweek}` +
        `&select=id,gameweek,entry_id,paid,winner,paid_at,updated_at` +
        `&order=entry_id.asc`
      );

    return res.status(200).json({
      gameweek,

      fee: Number(
        process.env.GW_ENTRY_FEE || 0
      ),

      zelle:
        process.env.ZELLE_DISPLAY || '',

      payments:
        Array.isArray(payments)
          ? payments
          : [],

      updatedAt:
        new Date().toISOString()
    });

  } catch (error) {
    console.error(
      'Payments API error:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Unable to load payments'
    });
  }
}
