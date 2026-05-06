import { vi } from 'vitest';

export const mockVault = {
	files: new Map<string, string>(),
	folders: new Set<string>(),

	setFile(path: string, content: string) {
		this.files.set(path, content);
	},

	clear() {
		this.files.clear();
		this.folders.clear();
	},

	async read(file: any): Promise<string> {
		return this.files.get(file.path) || '';
	},

	async create(path: string, content: string): Promise<any> {
		this.files.set(path, content);
		const name = path.split('/').pop() || '';
		const extension = name.split('.').pop() || 'md';
		return { path, name, extension };
	},

	async modify(file: any, content: string): Promise<void> {
		this.files.set(file.path, content);
	},

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	},

	getMarkdownFiles(): any[] {
		const result: any[] = [];
		for (const [path] of this.files) {
			if (path.endsWith('.md')) {
				const name = path.split('/').pop() || '';
				result.push({ path, name, extension: 'md' });
			}
		}
		return result;
	},

	getAbstractFileByPath(path: string): any {
		if (this.files.has(path)) {
			const name = path.split('/').pop() || '';
			const extension = name.split('.').pop() || 'md';
			return { path, name, extension };
		}
		if (this.folders.has(path)) {
			return { path };
		}
		return null;
	},
};

vi.mock('obsidian', () => ({
	Notice: class Notice {
		constructor(message: string) {
			console.log(`[Notice] ${message}`);
		}
	},
	PluginSettingTab: class PluginSettingTab {
		constructor(
			public app: any,
			public plugin: any
		) {}
		display(): void {}
	},
	Setting: class Setting {
		constructor(public containerEl: any) {}
		setName(name: string): this { return this; }
		setDesc(desc: string): this { return this; }
		addText(callback: (text: any) => void): this { return this; }
		addToggle(callback: (toggle: any) => void): this { return this; }
		addButton(callback: (button: any) => void): this { return this; }
		setPlaceholder(placeholder: string): this { return this; }
		setValue(value: string): this { return this; }
		setButtonText(text: string): this { return this; }
		onChange(callback: (value: any) => void): this { return this; }
	},
	TFile: class TFile {
		constructor(
			public path: string,
			public name: string,
			public extension: string = 'md'
		) {}
	},
	TFolder: class TFolder {
		constructor(public path: string) {}
	},
	Vault: class Vault {
		files = mockVault.files;
		folders = mockVault.folders;

		async read(file: any): Promise<string> {
			return mockVault.files.get(file.path) || '';
		}

		async create(path: string, content: string): Promise<any> {
			mockVault.files.set(path, content);
			const name = path.split('/').pop() || '';
			const extension = name.split('.').pop() || 'md';
			return { path, name, extension };
		}

		async modify(file: any, content: string): Promise<void> {
			mockVault.files.set(file.path, content);
		}

		async createFolder(path: string): Promise<void> {
			mockVault.folders.add(path);
		}

		getMarkdownFiles(): any[] {
			const result: any[] = [];
			for (const [path] of mockVault.files) {
				if (path.endsWith('.md')) {
					const name = path.split('/').pop() || '';
					result.push({ path, name, extension: 'md' });
				}
			}
			return result;
		}

		getAbstractFileByPath(path: string): any {
			if (mockVault.files.has(path)) {
				const name = path.split('/').pop() || '';
				const extension = name.split('.').pop() || 'md';
				return { path, name, extension };
			}
			if (mockVault.folders.has(path)) {
				return { path };
			}
			return null;
		}
	},
	App: class App {
		vault = mockVault;
	},
	Plugin: class Plugin {
		app: any;
		constructor(app: any) {
			this.app = app;
		}
		loadData(): Promise<any> { return Promise.resolve({}); }
		saveData(_data: any): Promise<void> { return Promise.resolve(); }
		addCommand(_command: any): any { return {}; }
		addSettingTab(_tab: any): void {}
		registerEvent(_event: any): void {}
		registerDomEvent(_element: any, _event: string, _handler: any): void {}
		registerInterval(_id: number): void {}
	},
	requestUrl: vi.fn(),
}));

global.fetch = vi.fn();