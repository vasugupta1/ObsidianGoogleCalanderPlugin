import {App, Notice, PluginSettingTab, Setting} from "obsidian";
import MyPlugin from "./main";
import {OAuthTokens} from "./google-oauth";

export interface SyncedEvent {
	syncId: string;
	googleEventId: string;
	lastSynced: number;
}

export interface MyPluginSettings {
	mySetting: string;
	client_id: string;
	client_secret: string;
	dailyNotesPath: string;
	calendarId: string;
	syncDaysRange: number;
	autoSyncEnabled: boolean;
	oauth_tokens?: OAuthTokens;
	syncedEventsMap: Record<string, SyncedEvent>;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	client_id: '',
	client_secret: '',
	dailyNotesPath: 'Daily Notes',
	calendarId: 'primary',
	syncDaysRange: 30,
	autoSyncEnabled: false,
	syncedEventsMap: {}
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
		.setName('Google Client ID')
		.setDesc('Enter your Google OAuth Client ID')
		.addText(text => text
			.setPlaceholder('Enter client ID')
			.setValue(this.plugin.settings.client_id)
			.onChange(async (value) => {
				this.plugin.settings.client_id = value;
				await this.plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Google Client Secret')
		.setDesc('Enter your Google OAuth Client Secret')
		.addText(text => text
			.setPlaceholder('Enter client secret')
			.setValue(this.plugin.settings.client_secret)
			.onChange(async (value) => {
				this.plugin.settings.client_secret = value;
				await this.plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Daily Notes Path')
		.setDesc('Path to your daily notes folder (leave empty for root)')
		.addText(text => text
			.setPlaceholder('e.g., Daily Notes')
			.setValue(this.plugin.settings.dailyNotesPath)
			.onChange(async (value) => {
				this.plugin.settings.dailyNotesPath = value;
				await this.plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Calendar ID')
		.setDesc('Google Calendar ID (use "primary" for your main calendar)')
		.addText(text => text
			.setPlaceholder('primary')
			.setValue(this.plugin.settings.calendarId)
			.onChange(async (value) => {
				this.plugin.settings.calendarId = value || 'primary';
				await this.plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Sync Days Range')
		.setDesc('Number of days to sync from Google Calendar')
		.addText(text => text
			.setPlaceholder('30')
			.setValue(String(this.plugin.settings.syncDaysRange))
			.onChange(async (value) => {
				this.plugin.settings.syncDaysRange = parseInt(value) || 30;
				await this.plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Auto Sync')
		.setDesc('Enable automatic two-way sync')
		.addToggle(toggle => toggle
			.setValue(this.plugin.settings.autoSyncEnabled)
			.onChange(async (value) => {
				this.plugin.settings.autoSyncEnabled = value;
				await this.plugin.saveSettings();
				this.plugin.setupAutoSync();
			}));

	new Setting(containerEl)
		.setName('Authorization Code')
		.setDesc('Paste the authorization code from Google after OAuth flow')
		.addText(text => text
			.setPlaceholder('Enter authorization code')
			.setValue(''))
		.addButton(button => button
			.setButtonText('Submit')
			.onClick(async () => {
				const input = containerEl.querySelector('input[placeholder="Enter authorization code"]') as HTMLInputElement;
				const code = input?.value?.trim();
				
				if (!code) {
					new Notice('Please enter the authorization code first.');
					return;
				}
				if (!this.plugin.settings.client_id) {
					new Notice('Please enter your Google Client ID first.');
					return;
				}
				
				try {
					const tokens = await this.plugin.exchangeCodeForTokens(code);
					this.plugin.settings.oauth_tokens = tokens;
					await this.plugin.saveSettings();
					new Notice('Successfully authenticated with Google Calendar!');
					this.display();
				} catch (error) {
					console.error('Token exchange failed:', error);
					new Notice('Token exchange failed. Check console for details.');
				}
			}));

		const isAuthenticated = !!this.plugin.settings.oauth_tokens;

		new Setting(containerEl)
			.setName('Authentication Status')
			.setDesc(isAuthenticated ? 'Authenticated with Google Calendar' : 'Not authenticated')
			.addButton(button => button
				.setButtonText(isAuthenticated ? 'Disconnect' : 'Connect to Google Calendar')
				.onClick(async () => {
					if (isAuthenticated) {
						this.plugin.settings.oauth_tokens = undefined;
						await this.plugin.saveSettings();
						this.display();
					} else {
						await this.plugin.startOAuthFlow();
					}
				}));
	}
}
