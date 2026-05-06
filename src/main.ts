import {App, Notice, Plugin, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";
import {startOAuthFlow, exchangeCodeForTokens, OAuthConfig} from "./google-oauth";
import {createEvent, parseEventsFromContent, extractDateFromFilename, getEventsFromGoogleCalendar, generateDailyNotePath, appendEventsToContent} from "./google-calendar";

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

		// Sync from Google Calendar to daily notes
		this.addCommand({
			id: 'sync-from-google-calendar',
			name: 'Sync from Google Calendar to daily notes',
			callback: async () => {
				await this.syncFromGoogleCalendar();
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

			const files = this.app.vault.getMarkdownFiles();
			let syncedCount = 0;
			let skippedCount = 0;

			for (const file of files) {
				if (this.settings.dailyNotesPath) {
					if (!file.path.startsWith(this.settings.dailyNotesPath)) {
						continue;
					}
				}

				const dateStr = extractDateFromFilename(file.name);
				if (!dateStr) {
					continue;
				}

				const content = await this.app.vault.read(file);
				const events = parseEventsFromContent(content, dateStr);
				
				if (events.length === 0) {
					continue;
				}

				const googleEvents = await getEventsFromGoogleCalendar(
					tokens,
					config,
					this.settings.calendarId || 'primary',
					dateStr,
					dateStr
				);

				const googleEventHashes = new Set(googleEvents.map(e => e.hash));

				for (const event of events) {
					if (event.hash && googleEventHashes.has(event.hash)) {
						console.log('Skipping duplicate event:', {
							summary: event.summary,
							hash: event.hash
						});
						skippedCount++;
						continue;
					}

					try {
						console.log('Attempting to sync event:', {
							summary: event.summary,
							startDateTime: event.startDateTime,
							endDateTime: event.endDateTime,
							hash: event.hash,
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

			new Notice(`Synced ${syncedCount} events to Google Calendar. ${skippedCount} duplicates skipped.`);
		} catch (error) {
			console.error('Sync failed:', error);
			new Notice('Sync failed. Check console for details.');
		}
	}

	async syncFromGoogleCalendar(): Promise<void> {
		console.log('Starting syncFromGoogleCalendar...');
		
		if (!this.settings.oauth_tokens) {
			console.error('No OAuth tokens found');
			new Notice('Please authenticate with Google Calendar first.');
			return;
		}

		if (!this.settings.calendarId) {
			console.error('Missing configuration: calendarId');
			new Notice('Please configure Calendar ID in settings.');
			return;
		}

		try {
			const tokens = this.settings.oauth_tokens;
			const config: OAuthConfig = {
				client_id: this.settings.client_id,
				client_secret: this.settings.client_secret,
				redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
			};

			const now = new Date();
			const todayStr = now.toISOString().split('T')[0] ?? '';
			const tomorrow = new Date(now);
			tomorrow.setDate(tomorrow.getDate() + 1);
			const tomorrowStr = tomorrow.toISOString().split('T')[0] ?? '';

			console.log('Fetching events from', todayStr, 'to', tomorrowStr);

			const calendarId = this.settings.calendarId || 'primary';
			
			const googleEvents = await getEventsFromGoogleCalendar(
				tokens,
				config,
				calendarId,
				todayStr,
				tomorrowStr
			);

			if (googleEvents.length === 0) {
				new Notice('No events found in Google Calendar for today/tomorrow.');
				return;
			}

			console.log('Retrieved', googleEvents.length, 'events from Google Calendar');

			const dailyNotesPath = this.settings.dailyNotesPath || '';
			
			if (dailyNotesPath) {
				const folder = this.app.vault.getAbstractFileByPath(dailyNotesPath);
				if (!folder) {
					console.log('Creating daily notes folder:', dailyNotesPath);
					await this.app.vault.createFolder(dailyNotesPath);
				}
			}
			
			const dailyNotePath = generateDailyNotePath(dailyNotesPath, todayStr);
			console.log('Daily note path:', dailyNotePath);

			const existingFile = this.app.vault.getAbstractFileByPath(dailyNotePath);
			let existingEvents: import('./google-calendar').CalendarEvent[] = [];
			let existingFileHandle: TFile | null = null;

			if (existingFile && (existingFile as TFile).extension) {
				existingFileHandle = existingFile as TFile;
				const content = await this.app.vault.read(existingFileHandle);
				console.log('Existing file content length:', content.length);
				
				existingEvents = parseEventsFromContent(content, todayStr);
				console.log('Existing events:', existingEvents.length);
			}

			const existingEventHashes = new Set(existingEvents.map(e => e.hash).filter((h): h is string => !!h));
			const newEvents = googleEvents.filter(e => !e.hash || !existingEventHashes.has(e.hash));
			console.log('New events:', newEvents.length, '| Duplicates skipped:', googleEvents.length - newEvents.length);

			const allEvents = [...existingEvents, ...newEvents];
			
			const uniqueEvents = allEvents.filter((event, index, self) => 
				index === self.findIndex(e => e.hash === event.hash)
			);
			
			const sortedEvents = uniqueEvents.sort((a, b) => 
				new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
			);
			
			console.log('Total unique sorted events:', sortedEvents.length);

			if (sortedEvents.length === 0) {
				new Notice('No events to sync.');
				return;
			}

			const headerContent = `# Time Blocking\n\n`;
			const newContent = appendEventsToContent(headerContent, sortedEvents);
			console.log('New content length:', newContent.length);

			if (existingFileHandle) {
				await this.app.vault.modify(existingFileHandle, newContent);
			} else {
				await this.app.vault.create(dailyNotePath, newContent);
			}

			new Notice(`Synced ${sortedEvents.length} events to daily note.`);
		} catch (error) {
			console.error('Sync from Google Calendar failed:', error);
			new Notice('Sync failed. Check console for details.');
		}
	}
}
