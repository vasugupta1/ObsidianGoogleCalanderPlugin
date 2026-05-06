export class Notice {
	constructor(message: string) {
		console.log(`[Notice] ${message}`);
	}
}

export class TFile {
	constructor(
		public path: string,
		public name: string,
		public extension: string = 'md'
	) {}
}

export class TFolder {
	constructor(public path: string) {}
}

export class Vault {
	private files: Map<string, string> = new Map();
	private folders: Set<string> = new Set();

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path) || '';
	}

	async create(path: string, content: string): Promise<TFile> {
		this.files.set(path, content);
		const name = path.split('/').pop() || '';
		const extension = name.split('.').pop() || 'md';
		return new TFile(path, name, extension);
	}

	async modify(file: TFile, content: string): Promise<void> {
		this.files.set(file.path, content);
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	getMarkdownFiles(): TFile[] {
		const result: TFile[] = [];
		for (const [path] of this.files) {
			if (path.endsWith('.md')) {
				const name = path.split('/').pop() || '';
				result.push(new TFile(path, name, 'md'));
			}
		}
		return result;
	}

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		if (this.files.has(path)) {
			const name = path.split('/').pop() || '';
			const extension = name.split('.').pop() || 'md';
			return new TFile(path, name, extension);
		}
		if (this.folders.has(path)) {
			return new TFolder(path);
		}
		return null;
	}
}

export class App {
	vault = new Vault();
}

export class Plugin {
	app: App;
	constructor(app: App) {
		this.app = app;
	}

	async loadData(): Promise<any> {
		return {};
	}

	async saveData(data: any): Promise<void> {}

	addCommand(command: any): any {}

	addSettingTab(settingTab: any): void {}

	registerEvent(event: any): void {}

	registerDomEvent(element: any, event: string, handler: any): void {}

	registerInterval(id: number): void {}
}

export const requestUrl = async (params: {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
}): Promise<{
	status: number;
	text: string;
}> => {
	throw new Error('requestUrl not implemented in mock');
};