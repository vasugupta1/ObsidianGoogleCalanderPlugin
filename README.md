# Obsidian Google Calendar Sync Plugin

A plugin that syncs your Obsidian daily notes with Google Calendar events.

## Features

- **Two-way sync** - Sync events between Obsidian daily notes and Google Calendar
- **Conflict resolution** - Last-write-wins strategy handles simultaneous edits
- **Auto sync** - Automatically sync at regular intervals
- **Sync ID tracking** - Prevents duplicate events and sync loops

## Setup

### 1. Create Google Cloud OAuth Credentials

Before using the plugin, you need to create OAuth credentials in Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to **APIs & Services** → **OAuth consent screen**
4. Configure the consent screen:
   - User Type: External
   - Fill in required fields (app name, support email)
5. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
6. Create an **Desktop app** credential
7. Copy the **Client ID** and **Client Secret**

### 2. Configure the Plugin

Open Obsidian settings and navigate to the plugin settings:

| Setting | Description | Example |
|---------|-------------|---------|
| **Google Client ID** | Your OAuth Client ID | `12345...abc.apps.googleusercontent.com` |
| **Google Client Secret** | Your OAuth Client Secret | `GOCSPX-...` |
| **Daily Notes Path** | Folder where daily notes are stored | `Daily Notes` |
| **Calendar ID** | Google Calendar to sync with | `primary` |
| **Sync Days Range** | Number of days to sync | `30` |
| **Auto Sync** | Enable automatic two-way sync | Toggle on/off |

### 3. Authenticate with Google

1. In plugin settings, click **Connect to Google Calendar**
2. A browser window will open with Google's login page
3. Authorize the application
4. Copy the authorization code shown on Google's page
5. Paste the code into the **Authorization Code** field in settings
6. Click **Submit**

You should see "Successfully authenticated with Google Calendar!"

## Daily Notes Format

The plugin reads events from your daily notes in this format:

```markdown
# Time Blocking

- [ ] 09:00 - 10:00 Team Standup
- [ ] 14:00 - 15:00 Code Review
```

When events are synced from Google Calendar, they appear with a sync ID:

```markdown
# Time Blocking

- [ ] 09:00 - 10:00 Team Standup [syncId:obs_1705312200000_abc123]
```

**Do not manually edit the syncId** - it's used to track events across sync operations.

## Commands

Access these via the Command Palette (`Ctrl/Cmd + P`):

| Command | Description |
|---------|-------------|
| **Connect to Google Calendar** | Start OAuth flow |
| **Sync daily notes to Google Calendar** | One-way sync: Obsidian → Google |
| **Sync from Google Calendar to daily notes** | One-way sync: Google → Obsidian |
| **Two-way sync** | Bidirectional sync with conflict resolution |

## How Sync Works

### Matching Logic

1. **Sync ID matching** - Primary method for events that have been synced before
2. **Hash matching** - Fallback for legacy events without sync IDs
3. **New event** - If no match found, creates a new event

### Conflict Resolution

When the same event is modified in both places, the plugin uses **last-write-wins**:
- Compares `lastModified` timestamps from Google Calendar
- The most recent change wins

### Auto Sync

When enabled, auto sync runs every 10 minutes and performs a two-way sync.

## Troubleshooting

### "Please authenticate with Google Calendar first"
- Complete the OAuth flow in settings
- Check that Client ID and Client Secret are correct

### Events not appearing in daily notes
- Verify the **Daily Notes Path** matches your folder structure
- Check that daily note filename format is `YYYY-MM-DD.md`

### Duplicate events
- The sync ID system prevents duplicates for synced events
- For legacy events, run a two-way sync to assign sync IDs

### Token expired
- The plugin automatically refreshes access tokens
- If authentication is lost, reconnect via settings

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

## License

MIT