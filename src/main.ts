import {App, Notice, Plugin, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";
import {startOAuthFlow, exchangeCodeForTokens, OAuthConfig} from "./google-oauth";
import {createEvent, parseEventsFromContent, extractDateFromFilename, getEventsFromGoogleCalendar, generateDailyNotePath, appendEventsToContent, getEventsByDateMap, checkEventTextExists, mergeAndSortEvents, generateEventHash} from "./google-calendar";

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

		// Two-way sync
		this.addCommand({
			id: 'two-way-sync',
			name: 'Two-way sync',
			callback: async () => {
				await this.syncTwoWay();
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

			const syncDaysRange = this.settings.syncDaysRange || 30;
			const calendarId = this.settings.calendarId || 'primary';
			const dailyNotesPath = this.settings.dailyNotesPath || '';

			if (dailyNotesPath) {
				const folder = this.app.vault.getAbstractFileByPath(dailyNotesPath);
				if (!folder) {
					console.log('Creating daily notes folder:', dailyNotesPath);
					await this.app.vault.createFolder(dailyNotesPath);
				}
			}

			const now = new Date();
			const startDateStr = now.toISOString().split('T')[0] ?? '';
			const endDate = new Date(now);
			endDate.setDate(endDate.getDate() + syncDaysRange);
			const endDateStr = endDate.toISOString().split('T')[0] ?? '';

			console.log('Fetching events from', startDateStr, 'to', endDateStr);

			const googleEvents = await getEventsFromGoogleCalendar(
				tokens,
				config,
				calendarId,
				startDateStr,
				endDateStr
			);

			console.log('Retrieved', googleEvents.length, 'events from Google Calendar');

			if (googleEvents.length === 0) {
				new Notice('No events found in Google Calendar for the selected range.');
				return;
			}

			let totalEventsSynced = 0;

			for (let i = 0; i < syncDaysRange; i++) {
				const currentDate = new Date(now);
				currentDate.setDate(currentDate.getDate() + i);
				const currentDateStr = currentDate.toISOString().split('T')[0] ?? '';

				const dayEvents = googleEvents.filter(event => {
					const eventDate = new Date(event.startDateTime).toISOString().split('T')[0];
					return eventDate === currentDateStr;
				});

				if (dayEvents.length === 0) {
					continue;
				}

				const dailyNotePath = generateDailyNotePath(dailyNotesPath, currentDateStr);
				console.log('Processing:', currentDateStr, '-', dayEvents.length, 'events');

				const existingFile = this.app.vault.getAbstractFileByPath(dailyNotePath);
				let existingEvents: import('./google-calendar').CalendarEvent[] = [];
				let existingFileHandle: TFile | null = null;

				if (existingFile && (existingFile as TFile).extension) {
					existingFileHandle = existingFile as TFile;
					const content = await this.app.vault.read(existingFileHandle);
					existingEvents = parseEventsFromContent(content, currentDateStr);
				}

				const existingEventHashes = new Set(existingEvents.map(e => e.hash).filter((h): h is string => !!h));
				const newEvents = dayEvents.filter(e => !e.hash || !existingEventHashes.has(e.hash));

				const allEvents = [...existingEvents, ...newEvents];
				
				const uniqueEvents = allEvents.filter((event, index, self) => 
					index === self.findIndex(e => e.hash === event.hash)
				);
				
				const sortedEvents = uniqueEvents.sort((a, b) => 
					new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
				);

				if (sortedEvents.length === 0) {
					continue;
				}

				const headerContent = `# Time Blocking\n\n`;
				const newContent = appendEventsToContent(headerContent, sortedEvents);

				if (existingFileHandle) {
					await this.app.vault.modify(existingFileHandle, newContent);
				} else {
					await this.app.vault.create(dailyNotePath, newContent);
				}

				totalEventsSynced += sortedEvents.length;
			}

			new Notice(`Synced ${totalEventsSynced} events to daily notes.`);
		} catch (error) {
			console.error('Sync from Google Calendar failed:', error);
			new Notice('Sync failed. Check console for details.');
		}
	}

	async syncTwoWay(): Promise<void> {
		console.log('Starting Two-way sync...');
		
		if (!this.settings.oauth_tokens) {
			new Notice('Please authenticate with Google Calendar first.');
			return;
		}

		if (!this.settings.calendarId) {
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

			const syncDaysRange = this.settings.syncDaysRange || 30;
			const calendarId = this.settings.calendarId || 'primary';
			const dailyNotesPath = this.settings.dailyNotesPath || '';

			const now = new Date();
			const startDateStr = now.toISOString().split('T')[0] ?? '';
			const endDate = new Date(now);
			endDate.setDate(endDate.getDate() + syncDaysRange);
			const endDateStr = endDate.toISOString().split('T')[0] ?? '';

			console.log('=== PHASE 1: FETCH REMOTE STATE ===');
			const remoteEvents = await getEventsFromGoogleCalendar(
				tokens,
				config,
				calendarId,
				startDateStr,
				endDateStr
			);
			console.log(`Fetched ${remoteEvents.length} events from Google Calendar`);

			const remoteEventsMap = new Map<string, import('./google-calendar').CalendarEvent>();
			for (const event of remoteEvents) {
				if (event.hash) {
					remoteEventsMap.set(event.hash, event);
				}
			}

			console.log('=== PHASE 1: FETCH LOCAL STATE ===');
			const localEventsMap = new Map<string, import('./google-calendar').CalendarEvent>();
			
			for (let i = 0; i < syncDaysRange; i++) {
				const currentDate = new Date(now);
				currentDate.setDate(currentDate.getDate() + i);
				const dateStr = currentDate.toISOString().split('T')[0] ?? '';

				const dailyNotePath = generateDailyNotePath(dailyNotesPath, dateStr);
				const existingFile = this.app.vault.getAbstractFileByPath(dailyNotePath);

				if (existingFile && (existingFile as TFile).extension) {
					const content = await this.app.vault.read(existingFile as TFile);
					const localEvents = parseEventsFromContent(content, dateStr);
					
					for (const event of localEvents) {
						if (event.hash) {
							localEventsMap.set(event.hash, event);
						}
					}
					console.log(`Parsed ${localEvents.length} events from ${dateStr}.md`);
				}
			}
			console.log(`Total local events: ${localEventsMap.size}`);

			console.log('=== PHASE 2: RECONCILIATION ===');
			const pushToGoogle: import('./google-calendar').CalendarEvent[] = [];
			const pullToLocal: Map<string, import('./google-calendar').CalendarEvent[]> = new Map();

			for (const [hash, localEvent] of localEventsMap) {
				if (!remoteEventsMap.has(hash)) {
					pushToGoogle.push(localEvent);
				}
			}
			console.log(`Local Only (Push to Google): ${pushToGoogle.length}`);

			for (const [hash, remoteEvent] of remoteEventsMap) {
				if (!localEventsMap.has(hash)) {
					const eventDate = new Date(remoteEvent.startDateTime).toISOString().split('T')[0] ?? '';
					if (!pullToLocal.has(eventDate)) {
						pullToLocal.set(eventDate, []);
					}
					pullToLocal.get(eventDate)!.push(remoteEvent);
				}
			}
			console.log(`Remote Only (Pull to Local): ${pullToLocal.size} days with events`);

			console.log('=== PHASE 3: EXECUTION ===');
			
			let pushedCount = 0;
			let pullPushedCount = 0;

			if (pushToGoogle.length > 0) {
				console.log(`Processing ${pushToGoogle.length} pushes to Google...`);
				for (const event of pushToGoogle) {
					try {
						await createEvent(tokens, config, calendarId, event);
						console.log(`Pushed to Google: ${event.summary}`);
						pushedCount++;
						
						await new Promise(resolve => setTimeout(resolve, 50));
					} catch (err) {
						console.error(`Failed to push event: ${event.summary}`, err);
					}
				}
			}

			if (pullToLocal.size > 0) {
				console.log(`Processing pulls to local files...`);
				
				for (const [dateStr, newEvents] of pullToLocal) {
					const dailyNotePath = generateDailyNotePath(dailyNotesPath, dateStr);
					const existingFile = this.app.vault.getAbstractFileByPath(dailyNotePath);
					
					let existingContent = '';
					let existingEvents: import('./google-calendar').CalendarEvent[] = [];

					if (existingFile && (existingFile as TFile).extension) {
						existingContent = await this.app.vault.read(existingFile as TFile);
						existingEvents = parseEventsFromContent(existingContent, dateStr);
					} else {
						existingContent = `# Time Blocking\n\n`;
					}

					const mergedEvents = mergeAndSortEvents(existingEvents, newEvents);
					
					const filteredEvents = mergedEvents.filter(event => 
						!checkEventTextExists(existingContent, event)
					);

					if (filteredEvents.length > 0) {
						const allEvents = [...existingEvents, ...filteredEvents];
						const finalEvents = mergeAndSortEvents(existingEvents, allEvents);
						
						const newContent = appendEventsToContent(existingContent, finalEvents);
						
						if (existingFile && (existingFile as TFile).extension) {
							await this.app.vault.modify(existingFile as TFile, newContent);
						} else {
							await this.app.vault.create(dailyNotePath, newContent);
						}
						
						pullPushedCount += filteredEvents.length;
						console.log(`Pulled ${filteredEvents.length} events to ${dateStr}.md`);
					}
				}
			}

			console.log('=== PHASE 4: VERIFICATION ===');
			console.log(`Total pushed to Google: ${pushedCount}`);
			console.log(`Total pulled to local: ${pullPushedCount}`);

			new Notice(`Sync Complete: ${pushedCount} uploaded, ${pullPushedCount} downloaded`);
		} catch (error) {
			console.error('Two-way sync failed:', error);
			new Notice('Two-way sync failed. Check console for details.');
		}
	}
}
