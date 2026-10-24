# Clean TV Home

A clean English app picker for Samsung Tizen TVs, installed as a TizenBrew module. No Samsung account, certificate, or separate app install is needed once TizenBrew is installed.

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
