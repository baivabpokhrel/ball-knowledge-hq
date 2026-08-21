import {
  supabaseRequest
} from '../lib/supabase.js';


export default async function handler(req, res) {

  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate'
  );


  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }


  const {
    password,
    gameweek,
    zelle,
    payments,
    winnerEntryIds
  } = req.body || {};


  /*
    =========================================
    AUTH
    =========================================
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
    =========================================
    VALIDATE GW
    =========================================
  */

  const gw =
    Number(gameweek);


  if (
    !Number.isInteger(gw) ||
    gw < 1 ||
    gw > 38
  ) {
    return res.status(400).json({
      error:
        'Invalid Gameweek'
    });
  }


  if (!Array.isArray(payments)) {
    return res.status(400).json({
      error:
        'Payments must be an array'
    });
  }


  const cleanZelle =
    String(
      zelle || ''
    ).trim();


  /*
    A Gameweek can end in a tie, so this is a SET of
    winner entry IDs, not a single one.
  */

  const winnerIds =
    new Set(
      (
        Array.isArray(winnerEntryIds)
          ? winnerEntryIds
          : []
      )
        .map(Number)
    );


  for (
    const winnerId of winnerIds
  ) {

    if (
      !Number.isInteger(winnerId) ||
      winnerId <= 0
    ) {
      return res.status(400).json({
        error:
          'Invalid winner'
      });
    }

  }


  try {

    const now =
      new Date().toISOString();


    /*
      =========================================
      BUILD PAYMENT SNAPSHOT
      =========================================
    */

    const records =
      payments.map(
        (item) => {

          const entryId =
            Number(
              item.entryId
            );


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
              winnerIds.has(entryId),

            paid_at:
              paid
                ? item.paidAt ||
                  now
                : null,

            updated_at:
              now

          };
        }
      );


    /*
      Make sure there are no duplicate managers.
    */

    const uniqueIds =
      new Set(
        records.map(
          record =>
            record.entry_id
        )
      );


    if (
      uniqueIds.size !==
      records.length
    ) {
      throw new Error(
        'Duplicate manager IDs found'
      );
    }


    /*
      Make sure every selected winner belongs
      to the submitted manager list.
    */

    for (
      const winnerId of winnerIds
    ) {

      if (
        !uniqueIds.has(
          winnerId
        )
      ) {
        throw new Error(
          'Selected winner is not part of this league'
        );
      }

    }


    /*
      =========================================
      SAVE PAYMENT / WINNER STATE
      =========================================
    */

    if (
      records.length > 0
    ) {

      await supabaseRequest(
        'payments?on_conflict=gameweek,entry_id',
        {
          method:
            'POST',

          headers: {
            Prefer:
              'resolution=merge-duplicates,return=representation'
          },

          body:
            JSON.stringify(
              records
            )
        }
      );

    }


    /*
      =========================================
      SAVE ZELLE FOR THIS GW
      =========================================
    */

    const settingRecord = {

      gameweek:
        gw,

      zelle_display:
        cleanZelle,

      updated_at:
        now

    };


    await supabaseRequest(
      'gameweek_settings?on_conflict=gameweek',
      {
        method:
          'POST',

        headers: {
          Prefer:
            'resolution=merge-duplicates,return=representation'
        },

        body:
          JSON.stringify([
            settingRecord
          ])
      }
    );


    /*
      =========================================
      READ BACK PAYMENTS
      =========================================
    */

    const savedPayments =
      await supabaseRequest(
        'payments' +
        `?gameweek=eq.${gw}` +
        '&select=id,gameweek,entry_id,paid,winner,paid_at,updated_at' +
        '&order=entry_id.asc'
      );


    /*
      =========================================
      READ BACK ZELLE
      =========================================
    */

    const savedSettingsRows =
      await supabaseRequest(
        'gameweek_settings' +
        `?gameweek=eq.${gw}` +
        '&select=gameweek,zelle_display,updated_at'
      );


    const savedSettings =
      Array.isArray(
        savedSettingsRows
      ) &&
      savedSettingsRows.length > 0
        ? savedSettingsRows[0]
        : null;


    /*
      =========================================
      VERIFY PAYMENTS
      =========================================
    */

    for (
      const expected of records
    ) {

      const actual =
        savedPayments.find(
          row =>
            Number(
              row.entry_id
            ) ===
            Number(
              expected.entry_id
            )
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


    /*
      Verify Zelle.
    */

    if (
      String(
        savedSettings?.zelle_display ||
        ''
      ).trim() !==
      cleanZelle
    ) {
      throw new Error(
        'Zelle save verification failed'
      );
    }


    return res.status(200).json({

      success:
        true,

      verified:
        true,

      gameweek:
        gw,

      payments:
        savedPayments,

      gameweekSetting:
        savedSettings,

      savedAt:
        new Date().toISOString()

    });


  } catch (error) {

    console.error(
      'Save GW error:',
      error
    );


    return res.status(500).json({

      success:
        false,

      error:
        error.message ||
        'Unable to save Gameweek'

    });
  }
}
