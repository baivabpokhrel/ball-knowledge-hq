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
    entryId,
    action,
    value
  } = req.body || {};

  /*
    ==========================================
    AUTH
    ==========================================
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
    ==========================================
    GAMEWEEK
    ==========================================
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

  try {
    const now =
      new Date().toISOString();

    /*
      ==========================================
      CLEAR WINNER
      ==========================================
    */

    if (
      action === 'clearWinner'
    ) {
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

      return res.status(200).json({
        success: true,
        gameweek: gw,
        action: 'clearWinner'
      });
    }

    /*
      Other actions require manager entry ID
    */

    const entry =
      Number(entryId);

    if (
      !Number.isInteger(entry) ||
      entry <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid FPL entry ID'
      });
    }

    if (
      action !== 'paid' &&
      action !== 'winner'
    ) {
      return res.status(400).json({
        error: 'Invalid action'
      });
    }

    /*
      ==========================================
      READ EXISTING ROW
      ==========================================
    */

    const existingRows =
      await supabaseRequest(
        `payments` +
        `?gameweek=eq.${gw}` +
        `&entry_id=eq.${entry}` +
        `&select=*`
      );

    const existing =
      Array.isArray(existingRows) &&
      existingRows.length
        ? existingRows[0]
        : null;

    /*
      ==========================================
      PAID / UNPAID
      ==========================================
    */

    if (
      action === 'paid'
    ) {
      const paid =
        value === true ||
        value === 'true';

      const record = {
        gameweek: gw,

        entry_id: entry,

        paid,

        /*
          Keep existing winner status.
        */
        winner:
          existing?.winner === true,

        paid_at:
          paid
            ? existing?.paid_at || now
            : null,

        updated_at: now
      };

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
              JSON.stringify([
                record
              ])
          }
        );

      return res.status(200).json({
        success: true,
        gameweek: gw,
        action: 'paid',

        payment:
          Array.isArray(result)
            ? result[0]
            : result
      });
    }

    /*
      ==========================================
      SET WINNER
      ==========================================
    */

    if (
      action === 'winner'
    ) {
      /*
        Clear previous winner for this GW.
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
        Preserve payment status.
      */

      const record = {
        gameweek: gw,

        entry_id: entry,

        paid:
          existing?.paid === true,

        winner: true,

        paid_at:
          existing?.paid_at || null,

        updated_at: now
      };

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
              JSON.stringify([
                record
              ])
          }
        );

      return res.status(200).json({
        success: true,
        gameweek: gw,
        action: 'winner',

        payment:
          Array.isArray(result)
            ? result[0]
            : result
      });
    }

  } catch (error) {
    console.error(
      'Admin payment update error:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Unable to save change'
    });
  }
}
