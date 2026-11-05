# How we use this: App Store Connect from Claude

This guide covers how we run this server day to day. It lets Claude (Claude Code or Claude Desktop) read App Store Connect for you: apps, TestFlight groups and testers, beta feedback, store listings in every language, version states, analytics, and sales reports. It also covers the few rules we keep so it stays safe.

Setup takes about 15 minutes. You need a Mac, Node 20 or newer, and a role on an Apple Developer team that lets you create API keys (Admin), or someone on the team who can make one for you.

---

## Why this fork and not the published package

The original project (`JoshuaRileyDev/app-store-connect-mcp-server`) is archived. We forked it and hardened it for local use:

- **Read-only by default.** Any request that is not a GET (adding or removing testers, editing a listing, creating a version) is blocked unless you start the server with `ASC_ALLOW_WRITES=true`. A model cannot change your live store by accident.
- **No secrets in config files.** Credentials live in the macOS login Keychain. The MCP config is just `node …/index.js`.
- **The token only goes to Apple.** The download tool used to attach your API token to any URL the model handed it. It now accepts only `https` URLs on Apple hosts, and attaches the token only to `api.appstoreconnect.apple.com`.
- **Removed:** a tool that ran `xcodebuild` on interpolated paths (command injection), the Docker and Smithery hosting files, and unused native dependencies.
- **Fixed:** 22 of the 26 upstream tools returned `[object Object]` instead of data. Every tool now returns real output.

Do not install it from npm or Smithery. Those install the old, unhardened upstream.

---

## 1. Make an App Store Connect API key

1. In App Store Connect, open **Users and Access → Integrations → App Store Connect API → Team Keys**.
2. Click **+**, give the key a name (for example `claude-mcp`), and pick the **lowest role that covers what you'll ask for**:
   - **App Manager** covers TestFlight (groups, testers, feedback) and reading the store listing. This is the usual pick.
   - For sales or analytics downloads, turn on **Access to Reports** as well. (An Admin key already includes reports, so it has no checkbox for it.)
   - Check Apple's role table if you need something narrower.
3. Download the `.p8` file. **Apple lets you download it only once.** If you lose it, revoke the key and make a new one.
4. Note the **Key ID** (shown in the key's row) and the **Issuer ID** (shown at the top of the page).

> **Analytics needs Admin once.** Apple requires an Admin-role key to *create* the first analytics report request for an app. After that, the everyday key can download the reports. We keep a separate Admin key just for that one step and never point this server at it. See section 6.

---

## 2. Install

```bash
git clone https://github.com/Sethmr/app-store-connect-mcp-server.git
cd app-store-connect-mcp-server
npm ci
npm run build
```

`dist/` is not committed, so you have to build it.

---

## 3. Put the credentials in the Keychain

```bash
scripts/setup-keychain.sh \
  --key-id <KEY_ID> \
  --issuer-id <ISSUER_ID> \
  --p8 ~/Downloads/AuthKey_<KEY_ID>.p8
```

Add `--vendor-number <NUMBER>` if you want the sales and finance report tools. Your vendor number is in App Store Connect under **Payments and Financial Reports**. Without it, those two tools stay hidden.

The script stores four Keychain items under the service `appstore-connect-mcp`. You can run it again to replace them. Once it finishes, the server no longer needs the `.p8` file. Move the file somewhere safe or delete it, but **don't leave it in Downloads**.

To check it worked:

```bash
security find-generic-password -s appstore-connect-mcp -a key-id -w | base64 -d
```

---

## 4. Connect it to Claude

**Claude Code** (works in every project; use an absolute path):

```bash
claude mcp add appstore-connect --scope user -- node /ABSOLUTE/PATH/app-store-connect-mcp-server/dist/src/index.js
```

Use `--scope local` instead, run from inside one project folder, to make it available only in that project. That is how we run it.

**Claude Desktop:** add this to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "appstore-connect": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/app-store-connect-mcp-server/dist/src/index.js"]
    }
  }
}
```

Don't add an `env` block. Credentials come from the Keychain.

Then **start a new session**. A session that is already running won't see the server.

**Check it:** ask Claude *"list my apps in App Store Connect"*. You should get your apps back with their IDs.

---

## 5. Day to day

### What we ask it for

- *"Who's in each TestFlight group for <app>, and what state are their invites in?"*
- *"Show me the latest beta feedback screenshots and what testers wrote."*
- *"Pull the live App Store description, keywords and promotional text for every locale."* (Handy before a listing change, and for catching a locale that's out of date.)
- *"What state is each App Store version in?"* (in review, ready for distribution, and so on)
- *"Download last week's sales summary."* (needs the vendor number)
- *"List the analytics reports for our report request and summarise downloads by source."*

Find the app's ID with `list_apps` once and paste it into later prompts. That saves a round trip.

### Writes stay deliberate

The server you registered in step 4 can only read, and we keep it that way. When we need a write (adding a tester, updating "What's New"), we:

1. Decide exactly what the change is first. Anything that changes something customers or testers see gets its own explicit request ("add X to group Y"), never a broad "clean up the testers".
2. Register a second copy of the server with writes turned on, for that one job:
   ```bash
   claude mcp add appstore-connect-write -e ASC_ALLOW_WRITES=true -- node /ABSOLUTE/PATH/app-store-connect-mcp-server/dist/src/index.js
   ```
3. Start a session, do the change, check it in App Store Connect, then remove the write copy:
   ```bash
   claude mcp remove appstore-connect-write
   ```

If the read-only server tries a write, it fails with a clear message (`Blocked DELETE …: this server is running in read-only mode`). That is the gate working.

---

## 6. Analytics reports (worth setting up early)

Apple's analytics (impressions, page views, downloads by source, pre-orders, installs) come from **report requests**. You create a request once per app, and Apple then generates reports from it.

1. With an **Admin** key, create two requests for the app: `ONGOING` (new data every day) and `ONE_TIME_SNAPSHOT` (backfills history). We ran this with a small separate script against the Admin key. To use this server's `create_analytics_report_request` instead, register a temporary write-enabled copy pointed at Admin credentials.
2. Wait 24 to 48 hours for the first reports.
3. With the everyday key: `list_analytics_reports` → instances → `list_analytics_report_segments` → `download_analytics_report_segment`. Each segment is a gzipped TSV.

Good to know:

- **The snapshot backfills.** Ours reached back to the day the app was first published, so it's not too late if you request late.
- **Daily files overlap.** The same row can appear in two consecutive daily instances, so remove duplicate rows before you add anything up.
- **Read the "Standard" reports, not "Detailed", at low volume.** Apple hides small counts for privacy, and the Detailed breakdown loses almost everything when numbers are small. Page-view counts get the same treatment, so treat them as a floor.

---

## 7. Updating

```bash
cd app-store-connect-mcp-server
git pull
npm ci
npm run build
```

Then **restart Claude**. A running session keeps using the build that was on disk when it started. So you can't test your own change from inside an existing session. Test it directly over stdio instead:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_apps","arguments":{"limit":3}}}' \
  | (cat; sleep 5) | node dist/src/index.js
```

You should see a JSON response with your apps in it.

---

## 8. When something goes wrong

| Symptom | Usual cause |
|---|---|
| Tools don't show up in Claude | Session started before you registered it (restart it), or the path in the config isn't absolute. |
| `401` / `NOT_AUTHORIZED` | Wrong Key ID or Issuer ID, or the key was revoked. Run `setup-keychain.sh` again. |
| `403` / `FORBIDDEN` | The key's role is too low for that call (for example, creating an analytics request without Admin). |
| `Blocked POST/PATCH/DELETE … read-only mode` | Working as intended. See "Writes stay deliberate". |
| Sales/finance tools missing | No vendor number stored. Run the setup script again with `--vendor-number`. |
| A Keychain password prompt appears | The items were created some other way. Run `setup-keychain.sh` again so `/usr/bin/security` gets access. |
| Not on a Mac | There's no Keychain. Set `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID` and `APP_STORE_CONNECT_P8_PATH` in the server's environment instead. Keep them out of anything you commit. |

---

## The rules, in one place

1. Credentials go in the Keychain, never in an MCP config, `.env`, or a repo.
2. The everyday server is read-only. Writes get a temporary write-enabled copy, one job at a time.
3. Give the key the lowest role that works. Keep any Admin key separate, and use it only for creating analytics requests.
4. After `git pull`, rebuild and restart Claude.
5. Install from this fork, not from npm.
