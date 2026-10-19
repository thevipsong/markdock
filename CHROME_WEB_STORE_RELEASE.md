# Chrome Web Store release notes

This extension handles Chrome bookmarks and sends selected bookmark domains to their sites for icon discovery. The Chrome Web Store listing must disclose this before installation; the in-extension notice obtains consent before the extension reads bookmarks or starts those requests.

## Listing disclosure draft

Place this near the beginning of the full store description and keep the Privacy practices answers consistent with it:

> **Data use:** MarkDock reads your Chrome bookmark titles, URLs, and folder names to display, search, organize, and update bookmarks when you ask. When you use the quick-save shortcut or context menu, it reads the current tab title and URL to create a bookmark. Bookmarks created or imported into MarkDock, favorites, icon overrides, and wallpaper settings are stored locally. Chrome Sync stores interface preferences and folder IDs needed to restore expanded folders. When bookmark cards appear, MarkDock may request high-resolution icons directly from those bookmark sites. Optional link checks contact bookmark URLs only after you start a check and grant host access. Bing is contacted only when you choose Bing wallpaper. MarkDock does not send your bookmark list to the developer and does not use analytics or advertising.

## Before submitting

- Replace the developer-name and contact-email placeholders in `PRIVACY.md` and `privacy.html`.
- Publish `privacy.html` at a public HTTPS URL that directly serves the policy, then enter that URL in the Chrome Web Store Developer Dashboard.
- Complete the Dashboard's Privacy practices and Limited Use disclosures to match the listing, policy, manifest, and runtime behavior.
- Upload the 128 px extension icon and current store screenshots. The existing `assets/preview` images are product previews; review them for legibility and listing suitability before upload.
- Package only the extension files. Do not include `.playwright-cli/`, `scratch_light_wallpaper.png`, Python cache files, or local development artifacts.
- Confirm the developer account and contact details, review the final listing, then submit it through the Developer Dashboard.

If user-data practices change after publication, update this disclosure and the consent version in `app.js` and `appearance.js` so existing users see the revised notice before the new data flow runs.
