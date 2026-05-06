import { vi } from 'vitest';

vi.mock('obsidian', () => ({
	Notice: class Notice {
		constructor(message: string) {
			console.log(`[Notice] ${message}`);
		}
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
		private files: Map<string, string> = new Map();
		private folders: Set<string> = new Set();

		async read(file: any): Promise<string> {
			return this.files.get(file.path) || '';
		}

		async create(path: string, content: string): Promise<any> {
			this.files.set(path, content);
			const name = path.split('/').pop() || '';
			const extension = name.split('.').pop() || 'md';
			return { path, name, extension };
		}

		async modify(file: any, content: string): Promise<void> {
			this.files.set(file.path, content);
		}

		async createFolder(path: string): Promise<void> {
			this.folders.add(path);
		}

		getMarkdownFiles(): any[] {
			const result: any[] = [];
			for (const [path] of this.files) {
				if (path.endsWith('.md')) {
					const name = path.split('/').pop() || '';
					result.push({ path, name, extension: 'md' });
				}
			}
			return result;
		}

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
		}
	},
	App: class App {
		vault = new (Vault as any)();
	},
	Plugin: class Plugin {},
	requestUrl: vi.fn(),
}));

global.fetch = vi.fn();