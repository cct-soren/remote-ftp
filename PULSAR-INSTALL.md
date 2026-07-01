# pulsar-remote-ftp — Development Install Guide

This is a fork of [icetee/remote-ftp](https://github.com/icetee/remote-ftp), updated for compatibility with modern [Pulsar](https://pulsar-edit.dev/) and Node.js versions.

## What changed from the original

- Renamed package to `pulsar-remote-ftp` so it can coexist with the original `remote-ftp`
- Added Pulsar engine declaration (`>=1.100.0`)
- Fixed `new Buffer()` → `Buffer.from()` (removed in Node.js 10+)
- Removed private Atom internal API usage in the password dialog (`inlineListenersByCommandName`)
- Fully migrated all views from `atom-space-pen-views` (SpacePen/jQuery) to plain DOM — `atom-space-pen-views` dependency removed
- Progress bar visible during transfers; queue panel auto-expands while transfers are active

## Requirements

- [Pulsar](https://pulsar-edit.dev/) v1.100.0 or later
- The original `remote-ftp` package disabled (Settings → Packages → search `remote-ftp` → Disable)

## Installation (development/local)

**1. Clone the repo**
```
git clone https://github.com/cct-soren/remote-ftp.git
```

**2. Install dependencies**
```
cd remote-ftp
"C:\Users\<you>\AppData\Local\Programs\Pulsar\resources\app\ppm\bin\ppm.cmd" install --production
```

**3. Link into Pulsar**
```
"C:\Users\<you>\AppData\Local\Programs\Pulsar\resources\app\ppm\bin\ppm.cmd" link "path\to\remote-ftp"
```
This creates a symlink: `~\.pulsar\packages\pulsar-remote-ftp → path\to\remote-ftp`

**4. Activate in Pulsar**
1. Go to **Settings → Packages**
2. Disable the original `remote-ftp` package if installed
3. Press `Ctrl+Shift+F5` to reload Pulsar
4. Search for `pulsar-remote-ftp` and confirm it is enabled

## Development workflow

After any code change, press `Ctrl+Shift+F5` in Pulsar to reload. No reinstall needed — the symlink keeps the package folder live.

## Known remaining issues

- The `ssh2` dependency is pinned to an older version (`^0.8.7`) — may need updating for newer Node.js/OpenSSL compatibility
- The queue panel appears at the bottom of the scroll area on very long file lists (layout limitation)
