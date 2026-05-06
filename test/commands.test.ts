import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockVault } from './test-setup';
import MyPlugin from '../src/main';

const validTokens = {
	access_token: 'test-access-token',
	refresh_token: 'test-refresh-token',
	expires_at: Date.now() + 3600000,
	token_type: 'Bearer',
};

const mockConfig = {
	client_id: 'test-client-id',
	client_secret: 'test-client-secret',
	redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
};

const getTodayStr = () => new Date().toISOString().split('T')[0];
const getTodayPlus = (days: number) => {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return d.toISOString().split('T')[0];
};

describe('sync-daily-notes command', () => {
	let plugin: MyPlugin;

	beforeEach(async () => {
		mockVault.clear();
		(global.fetch as any).mockReset();
		plugin = new MyPlugin({ vault: mockVault } as any);
		plugin.settings = {
			client_id: mockConfig.client_id,
			client_secret: mockConfig.client_secret,
			calendarId: 'primary',
			dailyNotesPath: 'daily',
			oauth_tokens: validTokens,
			autoSyncEnabled: false,
			syncDaysRange: 30,
		};
		mockVault.folders.add('daily');
	});

	it('should sync local events to Google Calendar', async () => {
		const today = getTodayStr();
		mockVault.setFile(`daily/${today}.md`, `# Time Blocking

- [ ] 09:00 - 10:00 Morning Meeting
- [ ] 14:00 - 15:00 Review
`);

		(global.fetch as any).mockResolvedValue({
			status: 200,
			text: () => Promise.resolve(JSON.stringify({ items: [] })),
		});

		await plugin.syncDailyNotes();

		const postCalls = (global.fetch as any).mock.calls.filter(
			(call: any) => call[0].includes('/events') && call[1]?.method === 'POST'
		);
		expect(postCalls.length).toBe(2);
		const bodies = postCalls.map((call: any) => JSON.parse(call[1]?.body));
		expect(bodies.map((b: any) => b.summary)).toContain('Morning Meeting');
		expect(bodies.map((b: any) => b.summary)).toContain('Review');
	});

	it('should skip duplicate events', async () => {
		const today = getTodayStr();
		mockVault.setFile(`daily/${today}.md`, `# Time Blocking

- [ ] 09:00 - 10:00 Meeting
`);

		(global.fetch as any).mockResolvedValue({
			status: 200,
			text: () => Promise.resolve(JSON.stringify({
				items: [{
					summary: 'Meeting',
					start: { dateTime: `${today}T09:00:00` },
					end: { dateTime: `${today}T10:00:00` },
				}],
			})),
		});

		await plugin.syncDailyNotes();

		const postCalls = (global.fetch as any).mock.calls.filter(
			(call: any) => call[0].includes('/events') && call[1]?.method === 'POST'
		);
		expect(postCalls.length).toBe(0);
	});

	it('should return early if no tokens configured', async () => {
		plugin.settings.oauth_tokens = undefined as any;

		await plugin.syncDailyNotes();

		const postCalls = (global.fetch as any).mock.calls.filter(
			(call: any) => call[0].includes('/events') && call[1]?.method === 'POST'
		);
		expect(postCalls.length).toBe(0);
	});

	it('should return early if no calendar ID configured', async () => {
		plugin.settings.calendarId = undefined as any;

		await plugin.syncDailyNotes();

		const postCalls = (global.fetch as any).mock.calls.filter(
			(call: any) => call[0].includes('/events') && call[1]?.method === 'POST'
		);
		expect(postCalls.length).toBe(0);
	});
});

describe('sync-from-google-calendar command', () => {
	let plugin: MyPlugin;

	beforeEach(async () => {
		mockVault.clear();
		(global.fetch as any).mockReset();
		plugin = new MyPlugin({ vault: mockVault } as any);
		plugin.settings = {
			client_id: mockConfig.client_id,
			client_secret: mockConfig.client_secret,
			calendarId: 'primary',
			dailyNotesPath: 'daily',
			oauth_tokens: validTokens,
			autoSyncEnabled: false,
			syncDaysRange: 7,
		};
	});

	it('should fetch events from Google Calendar and create daily notes', async () => {
		const today = getTodayStr();
		(global.fetch as any).mockResolvedValue({
			status: 200,
			text: () => Promise.resolve(JSON.stringify({
				items: [
					{
						summary: 'Team Meeting',
						start: { dateTime: `${today}T09:00:00` },
						end: { dateTime: `${today}T10:00:00` },
					},
					{
						summary: 'Lunch Break',
						start: { dateTime: `${today}T12:00:00` },
						end: { dateTime: `${today}T13:00:00` },
					},
				],
			})),
		});

		await plugin.syncFromGoogleCalendar();

		const dailyNoteContent = mockVault.files.get(`daily/${today}.md`);
		expect(dailyNoteContent).toBeDefined();
		expect(dailyNoteContent).toContain('Team Meeting');
		expect(dailyNoteContent).toContain('09:00 - 10:00 Team Meeting');
		expect(dailyNoteContent).toContain('12:00 - 13:00 Lunch Break');
	});

	it('should merge new events with existing daily note', async () => {
		const today = getTodayStr();
		mockVault.setFile(`daily/${today}.md`, `# Time Blocking

- [ ] 08:00 - 09:00 Existing Event
`);

		(global.fetch as any).mockResolvedValue({
			status: 200,
			text: () => Promise.resolve(JSON.stringify({
				items: [
					{
						summary: 'New Event',
						start: { dateTime: `${today}T10:00:00` },
						end: { dateTime: `${today}T11:00:00` },
					},
				],
			})),
		});

		await plugin.syncFromGoogleCalendar();

		const dailyNoteContent = mockVault.files.get(`daily/${today}.md`);
		expect(dailyNoteContent).toContain('Existing Event');
		expect(dailyNoteContent).toContain('New Event');
	});

	it('should return early if no tokens configured', async () => {
		plugin.settings.oauth_tokens = undefined as any;

		await plugin.syncFromGoogleCalendar();

		expect(mockVault.files.size).toBe(0);
	});

	it('should return early if no calendar ID configured', async () => {
		plugin.settings.calendarId = undefined as any;

		await plugin.syncFromGoogleCalendar();

		expect(mockVault.files.size).toBe(0);
	});
});

describe('two-way-sync command', () => {
	let plugin: MyPlugin;

	beforeEach(async () => {
		mockVault.clear();
		(global.fetch as any).mockReset();
		plugin = new MyPlugin({ vault: mockVault } as any);
		plugin.settings = {
			client_id: mockConfig.client_id,
			client_secret: mockConfig.client_secret,
			calendarId: 'primary',
			dailyNotesPath: 'daily',
			oauth_tokens: validTokens,
			autoSyncEnabled: false,
			syncDaysRange: 7,
		};
		mockVault.folders.add('daily');
	});

	it('should push local events to Google Calendar', async () => {
		const today = getTodayStr();
		mockVault.setFile(`daily/${today}.md`, `# Time Blocking

- [ ] 10:00 - 11:00 Local Only Event
`);

		(global.fetch as any).mockResolvedValue({
			status: 200,
			text: () => Promise.resolve(JSON.stringify({ items: [] })),
		});

		await plugin.syncTwoWay();

		const postCalls = (global.fetch as any).mock.calls.filter(
			(call: any) => call[0].includes('/events') && call[1]?.method === 'POST'
		);
		expect(postCalls.length).toBeGreaterThan(0);
		const bodies = postCalls.map((call: any) => JSON.parse(call[1]?.body));
		expect(bodies.some((b: any) => b.summary === 'Local Only Event')).toBe(true);
	});

	it('should pull remote-only events to local files', async () => {
		const today = getTodayStr();
		mockVault.setFile(`daily/${today}.md`, '# Time Blocking\n');

		(global.fetch as any).mockResolvedValue({
			status: 200,
			text: () => Promise.resolve(JSON.stringify({
				items: [
					{
						summary: 'Remote Only Event',
						start: { dateTime: `${today}T14:00:00` },
						end: { dateTime: `${today}T15:00:00` },
					},
				],
			})),
		});

		await plugin.syncTwoWay();

		const dailyNoteContent = mockVault.files.get(`daily/${today}.md`);
		expect(dailyNoteContent).toContain('Remote Only Event');
	});

	it('should not recreate events that exist in both places', async () => {
		const today = getTodayStr();
		mockVault.setFile(`daily/${today}.md`, `# Time Blocking

- [ ] 09:00 - 10:00 Synced Event
`);

		(global.fetch as any).mockResolvedValue({
			status: 200,
			text: () => Promise.resolve(JSON.stringify({
				items: [
					{
						summary: 'Synced Event',
						start: { dateTime: `${today}T09:00:00` },
						end: { dateTime: `${today}T10:00:00` },
					},
				],
			})),
		});

		await plugin.syncTwoWay();

		const postCalls = (global.fetch as any).mock.calls.filter(
			(call: any) => call[0].includes('/events') && call[1]?.method === 'POST'
		);
		expect(postCalls.length).toBe(0);
	});

	it('should return early if no tokens configured', async () => {
		plugin.settings.oauth_tokens = undefined as any;

		await plugin.syncTwoWay();

		const fetchCalls = (global.fetch as any).mock.calls;
		expect(fetchCalls.length).toBe(0);
	});

	it('should return early if no calendar ID configured', async () => {
		plugin.settings.calendarId = undefined as any;

		await plugin.syncTwoWay();

		const fetchCalls = (global.fetch as any).mock.calls;
		expect(fetchCalls.length).toBe(0);
	});

	it('should handle mixed local and remote events', async () => {
		const today = getTodayStr();
		mockVault.setFile(`daily/${today}.md`, `# Time Blocking

- [ ] 08:00 - 09:00 Local Event
`);

		(global.fetch as any).mockResolvedValue({
			status: 200,
			text: () => Promise.resolve(JSON.stringify({
				items: [
					{
						summary: 'Remote Event',
						start: { dateTime: `${today}T15:00:00` },
						end: { dateTime: `${today}T16:00:00` },
					},
				],
			})),
		});

		await plugin.syncTwoWay();

		const dailyNoteContent = mockVault.files.get(`daily/${today}.md`);
		expect(dailyNoteContent).toContain('Local Event');
		expect(dailyNoteContent).toContain('Remote Event');

		const postCalls = (global.fetch as any).mock.calls.filter(
			(call: any) => call[0].includes('/events') && call[1]?.method === 'POST'
		);
		expect(postCalls.length).toBeGreaterThan(0);
	});
});