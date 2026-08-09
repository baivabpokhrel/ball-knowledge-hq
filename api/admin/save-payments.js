import {
  supabaseRequest
} from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const {
    password,
    gameweek,
    payments,
    winnerEntryId
  } = req.body || {};

  /*
    AUTH
  */

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({
      error:
        'ADMIN_PASSWORD is not configured'
    });
  }

  if (
    password !==
    process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      error:
        'Incorrect admin password'
    });
  }

  /*
    VALIDATE GW
  */

  const gw =
    Number(gameweek);

  if (
    !Number.isInteger(gw) ||
    gw < 1 ||
    gw > 38
  ) {
    return res.status(400).json({
      error: 'Invalid Gameweek'
    });
  }

  if (!Array.isArray(payments)) {
    return res.status(400).json({
      error:
        'Payments must be an array'
    });
  }

  try {
    const now =
      new Date().toISOString();

    /*
      Clear previous winner for GW.
    */

    await supabaseRequest(
      `payments` +
      `?gameweek=eq.${gw}` +
      `&winner=eq.true`,
      {
        method: 'PATCH',

        headers: {
          Prefer:
            'return=minimal'
        },

        body:
          JSON.stringify({
            winner: false,
            updated_at: now
          })
      }
    );

    /*
      Build complete GW records.
    */

    const records =
      payments.map(item => {
        const entryId =
          Number(item.entryId);

        const paid =
          item.paid === true;

        const isWinner =
          winnerEntryId !== null &&
          winnerEntryId !== undefined &&
          Number(winnerEntryId) ===
            entryId;

        return {
          gameweek: gw,

          entry_id:
            entryId,

          paid,

          winner:
            isWinner,

          paid_at:
            paid
              ? item.paidAt || now
              : null,

          updated_at:
            now
        };
      });

    if (
      records.some(
        item =>
          !Number.isInteger(
            item.entry_id
          ) ||
          item.entry_id <= 0
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid manager entry ID'
      });
    }

    /*
      Upsert every manager in one request.
    */

    const result =
      await supabaseRequest(
        `payments` +
        `?on_conflict=gameweek,entry_id`,
        {
          method: 'POST',

          headers: {
            Prefer:
              'resolution=merge-duplicates,return=representation'
          },

          body:
            JSON.stringify(records)
        }
      );

    return res.status(200).json({
      success: true,

      gameweek: gw,

      saved:
        Array.isArray(result)
          ? result.length
          : records.length
    });

  } catch (error) {
    console.error(
      'Save payments error:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Unable to save Gameweek'
    });
  }
}
