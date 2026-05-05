import {App, Notice, Plugin} from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";
import {startOAuthFlow, exchangeCodeForTokens, OAuthConfig} from "./google-oauth";
import {createEvent, parseEventsFromContent, extractDateFromFilename} from "./google-calendar";

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// Google Calendar OAuth command
		this.addCommand({
			id: 'google-calendar-auth',
			name: 'Connect to Google Calendar',
			callback: async () => {
				await this.startOAuthFlow();
			}
		});

		// Sync daily notes to Google Calendar
		this.addCommand({
			id: 'sync-daily-notes',
			name: 'Sync daily notes to Google Calendar',
			callback: async () => {
				await this.syncDailyNotes();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async startOAuthFlow(): Promise<void> {
		if (!this.settings.client_id) {
			new Notice('Please enter your Google Client ID in settings first.');
			return;
		}

		const config: OAuthConfig = {
			client_id: this.settings.client_id,
			client_secret: this.settings.client_secret,
			redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
		};

		try {
			startOAuthFlow(config);
			new Notice('Google login page opened. Please authorize and paste the code from the page.');
		} catch (error) {
			new Notice('Failed to open Google login. Check console for details.');
			console.error('OAuth flow error:', error);
		}
	}

	async exchangeCodeForTokens(code: string): Promise<any> {
		if (!this.settings.client_id) {
			throw new Error('Client ID not configured');
		}

		console.log('exchangeCodeForTokens called with:');
		console.log('client_id present:', !!this.settings.client_id);
		console.log('client_secret present:', !!this.settings.client_secret);
		console.log('client_secret length:', this.settings.client_secret?.length || 0);

		const config: OAuthConfig = {
			client_id: this.settings.client_id,
			client_secret: this.settings.client_secret,
			redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
		};

		return await exchangeCodeForTokens(code, config);
	}

	async syncDailyNotes(): Promise<void> {
		console.log('Starting syncDailyNotes...');
		
		if (!this.settings.oauth_tokens) {
			console.error('No OAuth tokens found');
			new Notice('Please authenticate with Google Calendar first.');
			return;
		}

		if (!this.settings.dailyNotesPath && !this.settings.calendarId) {
			console.error('Missing configuration: dailyNotesPath or calendarId');
			new Notice('Please configure Daily Notes Path and Calendar ID in settings.');
			return;
		}

		console.log('Sync configuration:', {
			dailyNotesPath: this.settings.dailyNotesPath,
			calendarId: this.settings.calendarId,
			hasTokens: !!this.settings.oauth_tokens,
			tokenExpiry: this.settings.oauth_tokens?.expires_at
		});

		try {
			const tokens = this.settings.oauth_tokens;
			const config: OAuthConfig = {
				client_id: this.settings.client_id,
				client_secret: this.settings.client_secret,
				redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
			};

			// Get all markdown files
			const files = this.app.vault.getMarkdownFiles();
			let syncedCount = 0;

			for (const file of files) {
				// Check if file is in daily notes path (if specified)
				if (this.settings.dailyNotesPath) {
					if (!file.path.startsWith(this.settings.dailyNotesPath)) {
						continue;
					}
				}

				// Extract date from filename
				const dateStr = extractDateFromFilename(file.name);
				if (!dateStr) {
					continue;
				}

				// Read file content
				const content = await this.app.vault.read(file);
				
				// Parse events from content
				const events = parseEventsFromContent(content, dateStr);
				
				if (events.length === 0) {
					continue;
				}

				// Create events in Google Calendar
				for (const event of events) {
					try {
						console.log('Attempting to sync event:', {
							summary: event.summary,
							startDateTime: event.startDateTime,
							endDateTime: event.endDateTime,
							file: file.path
						});
						await createEvent(tokens, config, this.settings.calendarId || 'primary', event);
						console.log('Successfully created event:', event.summary);
						syncedCount++;
					} catch (err) {
						console.error('Failed to create event:', {
							event: event.summary,
							file: file.path,
							error: err instanceof Error ? err.message : err,
							stack: err instanceof Error ? err.stack : undefined
						});
					}
				}
			}

			new Notice(`Synced ${syncedCount} events to Google Calendar.`);
		} catch (error) {
			console.error('Sync failed:', error);
			new Notice('Sync failed. Check console for details.');
		}
	}
}
