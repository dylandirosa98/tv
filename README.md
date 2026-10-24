# Clean TV Home

A clean English app picker for Samsung Tizen TVs, installed as a TizenBrew module. It shows your real installed apps because the module view on this TV does not expose the system app API, so the list is bundled from the TV's own inventory.

## Install

1. On the TV, open TizenBrew.
2. Open Module Manager.
3. Choose Add GitHub Module.
4. Enter:
   ```text
   dylandirosa98/tv
   ```
5. Open Clean TV Home from TizenBrew. Refresh or re-add the module after updates so it pulls the newest version.

## Opening apps (relay)

The module cannot open apps by itself on this TV, so pressing OK sends a request to a small helper on the laptop, which forwards an open command over the TV's developer connection:

1. On the laptop, keep the TV's Host PC IP set to the laptop address (`10.0.0.58`) and restart the TV when prompted.
2. On the laptop, run from this folder:
   ```text
   python3 relay.py --tv 10.0.0.37 --port 8799
   ```
3. Keep that terminal running while using the module.

If the relay is unreachable, the module says so on screen instead of failing silently.

## Install

1. On the TV, open TizenBrew.
2. Open Module Manager.
3. Choose Add GitHub Module.
4. Enter:
   ```text
   dylandirosa98/tv
   ```
5. Open Clean TV Home from TizenBrew.

## Use

- Arrow keys move, OK opens the highlighted app.
- Green pins or unpins a favorite (up to 9).
- Red and Blue change pages, Yellow refreshes the app list.
- Back returns to TizenBrew.

Netflix, YouTube TV, YouTube, Prime Video, and Peacock are sorted first when installed. Other installed apps follow alphabetically.

## Limits

Samsung retail Tizen does not let a third-party web app replace the Home button or boot screen. This is a fast picker you open from TizenBrew, not a system Home replacement.

## Files

- `app/index.html`, `app/styles.css`, `app/app.js`: the module UI.
- `package.json`: TizenBrew module metadata.
