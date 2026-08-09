import {
  supabaseRequest
} from './lib/supabase.js';

const GW_ENTRY_FEE = 20;


function noCache(res) {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );

  res.setHeader(
    'CDN-Cache-Control',
    'no-store'
  );

  res.setHeader(
    'Vercel-CDN-Cache-Control',
    'no-store'
  );
}


export default async function handler(req, res) {

  noCache(res);


  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }


  try {

    /*
      =========================================
      RANGE MODE
      /api/payments?from=1&to=5
      =========================================
    */

    if (
      req.query.from !== undefined ||
      req.query.to !== undefined
    ) {

      const from =
        Number(
          req.query.from || 1
        );

      const to =
        Number(
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


      /*
        Get payment records
      */

      const payments =
        await supabaseRequest(
          'payments' +
          `?gameweek=gte.${from}` +
          `&gameweek=lte.${to}` +
          '&select=id,gameweek,entry_id,paid,winner,paid_at,updated_at' +
          '&order=gameweek.desc,entry_id.asc'
        );


      /*
        Get Zelle settings for all requested GWs
      */

      const settings =
        await supabaseRequest(
          'gameweek_settings' +
          `?gameweek=gte.${from}` +
          `&gameweek=lte.${to}` +
          '&select=gameweek,zelle_display,updated_at' +
          '&order=gameweek.desc'
        );


      return res.status(200).json({

        from,
        to,

        /*
          Fee never changes.
        */

        fee:
          GW_ENTRY_FEE,

        payments:
          Array.isArray(payments)
            ? payments
            : [],

        gameweekSettings:
          Array.isArray(settings)
            ? settings
            : [],

        updatedAt:
          new Date().toISOString(),

        requestId:
          Date.now()

      });
    }


    /*
      =========================================
      SINGLE GW MODE
      /api/payments?gw=1
      =========================================
    */

    const gameweek =
      Number(
        req.query.gw || 1
      );


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


    const settingsRows =
      await supabaseRequest(
        'gameweek_settings' +
        `?gameweek=eq.${gameweek}` +
        '&select=gameweek,zelle_display,updated_at'
      );


    const settings =
      Array.isArray(settingsRows) &&
      settingsRows.length > 0
        ? settingsRows[0]
        : null;


    return res.status(200).json({

      gameweek,

      fee:
        GW_ENTRY_FEE,

      zelle:
        settings?.zelle_display ||
        '',

      payments:
        Array.isArray(payments)
          ? payments
          : [],

      gameweekSettings:
        settings
          ? [settings]
          : [],

      updatedAt:
        new Date().toISOString(),

      requestId:
        Date.now()

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
