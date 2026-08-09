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

  const gw = Number(gameweek);
  const entry = Number(entryId);

  if (
    !Number.isInteger(gw) ||
    gw < 1 ||
    gw > 38
  ) {
    return res.status(400).json({
      error: 'Invalid Gameweek'
    });
  }

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

  try {
    const now =
      new Date().toISOString();

    /*
      --------------------------------
      PAYMENT STATUS
      --------------------------------
    */

    if (action === 'paid') {
      const record = {
        gameweek: gw,
        entry_id: entry,
        paid: Boolean(value),
        paid_at:
          value ? now : null,
        updated_at: now
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

            body: JSON.stringify([
              record
            ])
          }
        );

      return res.status(200).json({
        success: true,

        action: 'paid',

        payment:
          Array.isArray(result)
            ? result[0]
            : result
      });
    }

    /*
      --------------------------------
      WINNER STATUS
      --------------------------------

      If marking someone winner:
      first clear every winner in this GW.
    */

    if (
      action === 'winner' &&
      Boolean(value)
    ) {
      await supabaseRequest(
        `payments?gameweek=eq.${gw}&winner=eq.true`,
        {
          method: 'PATCH',

          headers: {
            Prefer:
              'return=minimal'
          },

          body: JSON.stringify({
            winner: false,
            updated_at: now
          })
        }
      );
    }

    /*
      Make sure the selected manager
      has a row, even if they have
      never been marked paid before.
    */

    const existing =
      await supabaseRequest(
        `payments?gameweek=eq.${gw}` +
        `&entry_id=eq.${entry}` +
        `&select=*`
      );

    let paid = false;

    if (
      Array.isArray(existing) &&
      existing.length > 0
    ) {
      paid =
        existing[0].paid === true;
    }

    const record = {
      gameweek: gw,
      entry_id: entry,
      paid,
      winner:
        Boolean(value),
      updated_at: now
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

          body: JSON.stringify([
            record
          ])
        }
      );

    return res.status(200).json({
      success: true,

      action: 'winner',

      payment:
        Array.isArray(result)
          ? result[0]
          : result
    });

  } catch (error) {
    console.error(
      'Admin payment error:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Unable to update record'
    });
  }
}
