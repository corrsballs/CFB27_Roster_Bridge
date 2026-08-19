# CFB27 Roster Bridge

Unofficial Chrome extension for EA CFB 27 Team Builder: build a full recruit
roster — ratings, names, archetypes, dev traits, stars, redshirts — and push it
straight into the Team Builder web editor. Every player card and team header is
computed with Team Builder's own rating math, so the numbers you set are the
numbers the game shows. Nothing leaves your browser.

## Install

1. Download this folder (green **Code** button → **Download ZIP**) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.
4. Open EA's Team Builder in a tab, then click the extension's toolbar icon to
   open the editor.

## Using it

1. **Find my team → Pull team** — copies your Team Builder roster into the
   editor. The game's own file is untouched until you push.
2. **Set Offense / Defense targets → Generate ratings** — builds a roster the
   game will display at exactly those numbers.
3. **Pick recruiting pipelines → Name roster from pool** — gives every player
   the name and bio of a real FCS / D2 / D3 college player, drawn from the
   states and regions you choose.
4. **Push to Team Builder** — your roster appears in TB on the next reload;
   press TB's own **Save** to keep it.

The ⓘ button in the editor explains every control in detail.

During a push Chrome briefly shows a *"started debugging this browser"* banner —
that is expected (see Permissions below); just don't click its **Cancel** button
mid-push.

## Permissions — what they're for

- **`storage` / `unlimitedStorage`** — rosters, the recruit pool, and captured
  team logos live in local extension storage. Nothing is sent to any server:
  reads come from EA's own CDN, and the edited roster goes only to your Team
  Builder tab.
- **Host access to `ea.com` / `cdn.mcr.ea.com`** — spotting and fetching Team
  Builder's roster payloads.
- **`debugger`** — the push mechanism. EA has no public roster-upload API, so
  the extension answers Team Builder's own roster request with your edited JSON
  and lets EA's own Save button persist it. Under Manifest V3 only
  `chrome.debugger` can substitute a response body. The extension attaches
  right before the page reload, serves the one roster payload, and detaches —
  nothing else is inspected.

## License

**MIT License** — see [LICENSE](LICENSE). Free to use, study, modify, and
share, with attribution.

**Not affiliated with, endorsed by, or supported by Electronic Arts.** EA, EA
SPORTS, and College Football 27 are trademarks of Electronic Arts Inc. This is
a fan tool that automates EA's own Team Builder web interface; use it at your
own risk and subject to EA's terms of service.

Provided **as is, without warranty of any kind** (see LICENSE).
