import {
  supabaseRequest
} from './lib/supabase.js';

async function getSettings() {

  const rows =
    await supabaseRequest(
      'league_settings?id=eq.1&select=id,zelle_display,gw_entry_fee,updated_at'
    );


  const settings =
    Array.isArray(rows) &&
    rows.length > 0
      ? rows[0]
      : null;


  return {

    zelle:
      settings?.zelle_display ||
      process.env.ZELLE_DISPLAY ||
      '',

    fee:
      Number(
        settings?.gw_entry_fee ??
        process.env.GW_ENTRY_FEE ??
        0
      )

  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const settings =
      await getSettings();

    /*
      MULTIPLE GAMEWEEKS
    */

    if (
      req.query.from !== undefined ||
      req.query.to !== undefined
    ) {
      const from =
        Number(req.query.from || 1);

      const to =
        Number(req.query.to || from);

      if (
        !Number.isInteger(from) ||
        !Number.isInteger(to) ||
        from < 1 ||
        to > 38 ||
        from > to
      ) {
        return res.status(400).json({
          error:
            'Invalid Gameweek range'
        });
      }

      const payments =
        await supabaseRequest(
          'payments' +
          `?gameweek=gte.${from}` +
          `&gameweek=lte.${to}` +
          '&select=id,gameweek,entry_id,paid,winner,paid_at,updated_at' +
          '&order=gameweek.desc,entry_id.asc'
        );

      return res.status(200).json({
        from,
        to,

        fee:
          settings.fee,

        zelle:
          settings.zelle,

        payments:
          Array.isArray(payments)
            ? payments
            : [],

        updatedAt:
          new Date().toISOString()
      });
    }

    /*
      SINGLE GAMEWEEK
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
        'payments' +
        `?gameweek=eq.${gameweek}` +
        '&select=id,gameweek,entry_id,paid,winner,paid_at,updated_at' +
        '&order=entry_id.asc'
      );

    return res.status(200).json({
      gameweek,

      fee:
        settings.fee,

      zelle:
        settings.zelle,

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
