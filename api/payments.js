import {
  supabaseRequest
} from './lib/supabase.js';

export default async function handler(
  req,
  res
) {
  if (req.method !== 'GET') {
    return res
      .status(405)
      .json({
        error:
          'Method not allowed'
      });
  }

  const gameweek =
    Number(
      req.query.gw || 1
    );

  if (
    !Number.isInteger(gameweek) ||
    gameweek < 1 ||
    gameweek > 38
  ) {
    return res
      .status(400)
      .json({
        error:
          'Invalid Gameweek'
      });
  }

  try {
    const payments =
      await supabaseRequest(
        `payments?gameweek=eq.${gameweek}&select=id,gameweek,entry_id,paid,paid_at,updated_at&order=entry_id.asc`
      );

    return res
      .status(200)
      .json({
        gameweek,

        fee:
          Number(
            process.env
              .GW_ENTRY_FEE ||
              0
          ),

        zelle:
          process.env
            .ZELLE_DISPLAY ||
          '',

        payments:
          Array.isArray(
            payments
          )
            ? payments
            : [],

        updatedAt:
          new Date()
            .toISOString()
      });
  } catch (error) {
    console.error(
      'Payments error:',
      error
    );

    return res
      .status(500)
      .json({
        error:
          error.message ||
          'Unable to load payments'
      });
  }
}
