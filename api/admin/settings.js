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
    zelle,
    fee
  } = req.body || {};


  if (
    password !==
    process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      error: 'Incorrect admin password'
    });
  }


  const cleanZelle =
    String(zelle || '').trim();

  const cleanFee =
    Number(fee);


  if (!cleanZelle) {
    return res.status(400).json({
      error:
        'Enter a Zelle phone number or email.'
    });
  }


  if (
    !Number.isFinite(cleanFee) ||
    cleanFee < 0
  ) {
    return res.status(400).json({
      error:
        'Enter a valid Gameweek fee.'
    });
  }


  try {

    const record = {
      id: 1,

      zelle_display:
        cleanZelle,

      gw_entry_fee:
        cleanFee,

      updated_at:
        new Date().toISOString()
    };


    const result =
      await supabaseRequest(
        'league_settings?on_conflict=id',
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


    const saved =
      Array.isArray(result)
        ? result[0]
        : result;


    return res.status(200).json({

      success: true,

      settings: {
        zelle:
          saved?.zelle_display ||
          cleanZelle,

        fee:
          Number(
            saved?.gw_entry_fee ??
            cleanFee
          )
      }

    });


  } catch (error) {

    console.error(
      'Settings error:',
      error
    );


    return res.status(500).json({
      error:
        error.message ||
        'Unable to save settings'
    });
  }
}
