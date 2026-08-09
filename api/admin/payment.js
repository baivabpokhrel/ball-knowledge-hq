import {
  supabaseRequest
} from '../lib/supabase.js';

export default async function handler(
  req,
  res
) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({
        error:
          'Method not allowed'
      });
  }

  const {
    password,
    gameweek,
    entryId,
    paid
  } = req.body || {};

  if (
    !process.env
      .ADMIN_PASSWORD
  ) {
    return res
      .status(500)
      .json({
        error:
          'ADMIN_PASSWORD is not configured'
      });
  }

  if (
    password !==
    process.env
      .ADMIN_PASSWORD
  ) {
    return res
      .status(401)
      .json({
        error:
          'Incorrect admin password'
      });
  }

  const gw =
    Number(gameweek);

  const entry =
    Number(entryId);

  if (
    !Number.isInteger(gw) ||
    gw < 1 ||
    gw > 38
  ) {
    return res
      .status(400)
      .json({
        error:
          'Invalid Gameweek'
      });
  }

  if (
    !Number.isInteger(entry) ||
    entry <= 0
  ) {
    return res
      .status(400)
      .json({
        error:
          'Invalid FPL entry ID'
      });
  }

  try {
    const now =
      new Date()
        .toISOString();

    const record = {
      gameweek: gw,
      entry_id: entry,
      paid:
        Boolean(paid),
      paid_at:
        paid
          ? now
          : null,
      updated_at:
        now
    };

    const result =
      await supabaseRequest(
        'payments?on_conflict=gameweek,entry_id',
        {
          method: 'POST',

          headers: {
            Prefer:
              'resolution=merge-duplicates,return=representation'
          },

          body:
            JSON.stringify([
              record
            ])
        }
      );

    return res
      .status(200)
      .json({
        success: true,

        payment:
          Array.isArray(
            result
          )
            ? result[0]
            : result
      });
  } catch (error) {
    console.error(
      'Admin payment error:',
      error
    );

    return res
      .status(500)
      .json({
        error:
          error.message ||
          'Unable to update payment'
      });
  }
}
