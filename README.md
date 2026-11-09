# gmail-unread-older_than-deleter

[Clicca qui per il README In italiano](README.it.md)

Chrome extension that, on an already open Gmail search, selects the visible page, moves it to Trash, waits five seconds, and repeats. Messages stay in Trash for 30 days.

The panel, the name, and the messages follow the browser language: Italian when the browser is in Italian, English otherwise. Gmail's own buttons are looked up in both Italian and English.

## Search requirements

The **Start** button stays disabled until the address is a search (`#search/`) that contains both of these:

- `is:unread`
- `older_than:` of at least 90 days (`90d`, `3m`, `1y`; a month counts as 30 days, a year as 365)

The rest of the query can change. For example:

```text
is:unread older_than:90d in:forums
is:unread older_than:1y from:linkedin.com
```

It will not start if the search contains any of these operators: `in:trash`, `in:spam`, `in:sent`, `in:draft`, `in:drafts`, `is:starred`, `is:important`. It will not start from Trash, Spam, Sent, Drafts, Starred, or Important either. If the search box was edited and no longer matches the address, press Enter before starting.

## Limits

- It only runs on `https://mail.google.com/`.
- Each cycle takes only the visible page, about 50 rows, then waits 5 seconds.
- It finds the trash control by the name **Delete** or **Elimina**, not by the icon's position.
- It stops on its own when the list stays empty. The panel says **Done. No rows left.** In Italian: **Finito. Nessuna riga rimasta.**
- If a click has no effect, it retries up to three times and then stops.
- It pauses when the tab is not visible. It keeps going when Gmail is the front tab of a window that stays open on screen, even while you work elsewhere. It stops if that window is minimized, fully covered, or on a macOS Space that is not visible.
- One Gmail window. Several tabs in the same window do not work together: the one behind is paused.

## Installation

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Reload Gmail. The panel appears at the bottom right.
5. Open a search that meets the requirements above and press **Start**.

Chrome warns that the extension can read and change data on `mail.google.com`: that is the permission the script needs to run inside Gmail. After a code change, click **Reload** on the extension in `chrome://extensions` and refresh the Gmail tab.

The same install works in Edge, Brave, and other Chromium browsers, from their extensions page.

## License

Released under the [MIT License](LICENSE).

This extension was tried only on a few setups. It may have bugs and it may not behave as you expect. Use it at your own risk. The author takes no responsibility if it does not work as intended.

Copyright (c) 2026 Francesco Sullo
