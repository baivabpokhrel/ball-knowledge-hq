# Ball Knowledge HQ v0.3

Mobile-first FPL mini-league dashboard.

## What is already built
- Separate Gameweek and overall standings
- Weekly ranking based only on final Gameweek points
- Provisional/processing/final status
- No winner declaration until the FPL event has `data_checked: true`
- Tie support
- Demo mode
- Vercel serverless API proxy

## Deploy free with Vercel
1. Create a free GitHub account and a free Vercel account.
2. Create a new GitHub repository.
3. Upload every file and folder from this project to the repository.
4. In Vercel choose **Add New → Project**, import the repository, and deploy.
5. Deploy and share the generated `your-project.vercel.app` link.

This build already uses league ID `92378`. You do not need to add an environment variable. You can still override it later by setting `FPL_LEAGUE_ID` in Vercel.

## Cost
Vercel Hobby is suitable for a small, non-commercial friends league and can host the site and serverless API at no charge within its limits.

## Next build step
Persist finalized weekly winners. The no-cost option is a scheduled GitHub Action that checks once after each Gameweek and commits a small `history.json` file. This is intentionally left disabled until the numeric league ID is added.
