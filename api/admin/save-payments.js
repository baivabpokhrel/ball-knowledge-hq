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

    const winnerId =
      winnerEntryId === null ||
      winnerEntryId === undefined ||
      winnerEntryId === ''
        ? null
        : Number(winnerEntryId);

    /*
      Build authoritative GW snapshot.
    */

    const records =
      payments.map(item => {
        const entryId =
          Number(item.entryId);

        if (
          !Number.isInteger(entryId) ||
          entryId <= 0
        ) {
          throw new Error(
            `Invalid entry ID: ${item.entryId}`
          );
        }

        const paid =
          item.paid === true;

        return {
          gameweek:
            gw,

          entry_id:
            entryId,

          paid,

          winner:
            winnerId !== null &&
            entryId === winnerId,

          paid_at:
            paid
              ? item.paidAt || now
              : null,

          updated_at:
            now
        };
      });

    /*
      Prevent accidental duplicate entry IDs.
    */

    const uniqueIds =
      new Set(
        records.map(
          row =>
            row.entry_id
        )
      );

    if (
      uniqueIds.size !==
      records.length
    ) {
      throw new Error(
        'Duplicate managers found in save request'
      );
    }

    /*
      Save complete snapshot.
    */

    await supabaseRequest(
      'payments?on_conflict=gameweek,entry_id',
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

    /*
      IMPORTANT:
      Read directly back from Supabase.
    */

    const savedRows =
      await supabaseRequest(
        'payments' +
        `?gameweek=eq.${gw}` +
        '&select=id,gameweek,entry_id,paid,winner,paid_at,updated_at' +
        '&order=entry_id.asc'
      );

    const saved =
      Array.isArray(savedRows)
        ? savedRows
        : [];

    /*
      Verify every submitted manager.
    */

    for (
      const expected of records
    ) {
      const actual =
        saved.find(
          row =>
            Number(row.entry_id) ===
            Number(expected.entry_id)
        );

      if (!actual) {
        throw new Error(
          `Save verification failed for entry ${expected.entry_id}`
        );
      }

      if (
        Boolean(actual.paid) !==
        Boolean(expected.paid)
      ) {
        throw new Error(
          `Payment verification failed for entry ${expected.entry_id}`
        );
      }

      if (
        Boolean(actual.winner) !==
        Boolean(expected.winner)
      ) {
        throw new Error(
          `Winner verification failed for entry ${expected.entry_id}`
        );
      }
    }

    return res.status(200).json({
      success: true,

      gameweek:
        gw,

      payments:
        saved,

      saved:
        saved.length,

      verified:
        true,

      savedAt:
        new Date().toISOString()
    });

  } catch (error) {
    console.error(
      'Save payments error:',
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error.message ||
        'Unable to save Gameweek'
    });
  }
}
