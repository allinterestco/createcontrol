# CreateControl

A free production planner for solo creators who make videos around a day job. You tell it how many minutes you have each day and which days you publish. It turns that into a cue sheet of work blocks for every video, with one tap to the app you need for each stage.

Built for the All Interest Co. site (allinterestco.com).

## What it does

- **Plan**: a day-by-day cue sheet. Each video moves through seven stages (idea, script, voiceover, visuals, edit, thumbnail and caption, upload). Long stages split across days. Tick a stage and the schedule closes up.
- **Honest scheduling**: if your hours cannot support your publish goal, it says so and marks videos late instead of pretending.
- **Videos**: your queue, with progress per video and "mark published".
- **Tools**: launch links for CapCut, Canva, ElevenLabs, Notes, Midjourney, TikTok Studio, YouTube Studio, Claude, ChatGPT and GitHub, plus copy-ready prompt starters.
- **Calendar export**: downloads an `.ics` file so work blocks and publish days show up in your phone calendar.
- **Private by design**: everything is stored in the visitor's own browser. There is no server and no account.

### About "connecting" your apps

Version 1 launches your apps and structures your workflow around them. It does not log in to them. CapCut, Canva, Midjourney, ElevenLabs and TikTok do not offer a simple open connection for a free hobby tool, and YouTube and TikTok APIs need app approval. A realistic next step is a YouTube Data API connection to read your published videos and view counts, which would need a small serverless function to keep the key secret.

## Files

| File | Job |
| --- | --- |
| `index.html` | The page |
| `styles.css` | Look and layout. Colours and fonts are tokens at the top |
| `core.js` | Scheduling and calendar logic. No page code, so it can be tested |
| `app.js` | Screens, buttons, saving |
| `test/core.test.js` | Tests for the logic. Run `node test/core.test.js` |
| `docs/github-refresher.md` | GitHub refresher for this project |

## Run it on your computer

Double-click `index.html`. For a closer match to the live site, run a tiny local server from this folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Put it on allinterestco.com

The safest setup is a subdomain, `createcontrol.allinterestco.com`. It does not touch whatever is on your main site today.

**Option A: GitHub Pages (free)**

1. Push this folder to a public GitHub repository (see `docs/github-refresher.md`).
2. In the repository, open Settings, then Pages. Set Source to "Deploy from a branch", branch `main`, folder `/ (root)`.
3. In the Custom domain box, enter `createcontrol.allinterestco.com` and save.
4. At the company where you manage allinterestco.com DNS, add a CNAME record: name `createcontrol`, value `YOUR-GITHUB-USERNAME.github.io`.
5. Wait for GitHub to finish the DNS check, then tick Enforce HTTPS.

**Option B: Cloudflare Pages (free)**: connect the same GitHub repository, use no build command and `/` as the output folder, then add `createcontrol.allinterestco.com` as a custom domain. Pick this if you ever expect heavy traffic or want no usage questions at all.

## Before you publish

1. **Set the donation link.** Open `app.js`, find `DONATION_URL`, and paste your donation page address between the quotes. Until then the Setup screen shows "Donation link not set yet".
2. **Check the tool links.** The defaults are public home pages. Anyone can override them in Setup.
3. **Run the tests**: `node test/core.test.js`.

## Costs and donations

- The site is static files, so there is no server to pay for. The real yearly cost is the domain you already own.
- Donations cost something to collect. Card processing in Canada is typically 2.9% plus 30 cents per payment (check your provider's current page). On a $1 donation that is about 33% gone. On a single $12 donation it is about 5%. A yearly $12 ask keeps far more of each dollar than a monthly $1 one.
- Ko-fi charges no platform fee on one-time donations, but the payment processor behind it still takes its cut.
- Money you receive from the site may count as income. Keep records and ask an accountant or the CRA what applies to you.

## Ideas for later

- Import your published videos from YouTube to learn your real posting rhythm.
- A "catch-up" mode when you miss a week.
- A shareable read-only plan page.
- Per-video notes and links to your Canva and CapCut projects.
