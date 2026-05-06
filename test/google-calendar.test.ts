import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	generateEventHash,
	parseEventsFromContent,
	extractDateFromFilename,
	mergeAndSortEvents,
	appendEventsToContent,
	formatEventForMarkdown,
	generateDailyNotePath,
} from '../src/google-calendar';

describe('generateEventHash', () => {
	it('should generate consistent hash for same input', () => {
		const hash1 = generateEventHash('2024-01-15T09:00:00', '2024-01-15T10:00:00', 'Meeting', '2024-01-15');
		const hash2 = generateEventHash('2024-01-15T09:00:00', '2024-01-15T10:00:00', 'Meeting', '2024-01-15');
		expect(hash1).toBe(hash2);
	});

	it('should generate different hash for different times', () => {
		const hash1 = generateEventHash('2024-01-15T09:00:00', '2024-01-15T10:00:00', 'Meeting', '2024-01-15');
		const hash2 = generateEventHash('2024-01-15T10:00:00', '2024-01-15T11:00:00', 'Meeting', '2024-01-15');
		expect(hash1).not.toBe(hash2);
	});

	it('should generate different hash for different summaries', () => {
		const hash1 = generateEventHash('2024-01-15T09:00:00', '2024-01-15T10:00:00', 'Meeting', '2024-01-15');
		const hash2 = generateEventHash('2024-01-15T09:00:00', '2024-01-15T10:00:00', 'Call', '2024-01-15');
		expect(hash1).not.toBe(hash2);
	});

	it('should normalize time to HH:MM format', () => {
		const hash1 = generateEventHash('2024-01-15T09:05:00', '2024-01-15T10:30:00', 'Meeting', '2024-01-15');
		const hash2 = generateEventHash('2024-01-15T09:05', '2024-01-15T10:30', 'Meeting', '2024-01-15');
		expect(hash1).toBe(hash2);
	});
});

describe('extractDateFromFilename', () => {
	it('should extract date from standard format', () => {
		const result = extractDateFromFilename('2024-01-15.md');
		expect(result).toBe('2024-01-15');
	});

	it('should extract date from filename with prefix', () => {
		const result = extractDateFromFilename('Daily-2024-01-15.md');
		expect(result).toBe('2024-01-15');
	});

	it('should return null for no date', () => {
		const result = extractDateFromFilename('note.md');
		expect(result).toBeNull();
	});
});

describe('parseEventsFromContent', () => {
	it('should parse single event', () => {
		const content = `# Time Blocking

- [ ] 09:00 - 10:00 Meeting
`;
		const events = parseEventsFromContent(content, '2024-01-15');
		expect(events).toHaveLength(1);
		expect(events[0].summary).toBe('Meeting');
		expect(events[0].startDateTime).toContain('09:00');
		expect(events[0].endDateTime).toContain('10:00');
	});

	it('should parse multiple events', () => {
		const content = `# Time Blocking

- [ ] 09:00 - 10:00 Meeting
- [ ] 11:00 - 12:00 Call
- [ ] 14:00 - 15:00 Lunch
`;
		const events = parseEventsFromContent(content, '2024-01-15');
		expect(events).toHaveLength(3);
	});

	it('should return empty array for no events', () => {
		const content = `# Notes

Some random notes without events.
`;
		const events = parseEventsFromContent(content, '2024-01-15');
		expect(events).toHaveLength(0);
	});

	it('should generate hash for each event', () => {
		const content = `- [ ] 09:00 - 10:00 Meeting`;
		const events = parseEventsFromContent(content, '2024-01-15');
		expect(events[0].hash).toBeDefined();
	});
});

describe('mergeAndSortEvents', () => {
	it('should merge and sort events by start time', () => {
		const existing = [
			{ summary: 'Meeting', startDateTime: '2024-01-15T14:00:00', endDateTime: '2024-01-15T15:00:00', hash: '1' },
		];
		const newEvents = [
			{ summary: 'Call', startDateTime: '2024-01-15T09:00:00', endDateTime: '2024-01-15T10:00:00', hash: '2' },
		];
		const merged = mergeAndSortEvents(existing, newEvents);
		expect(merged).toHaveLength(2);
		expect(merged[0].summary).toBe('Call');
		expect(merged[1].summary).toBe('Meeting');
	});

	it('should deduplicate by hash', () => {
		const existing = [
			{ summary: 'Meeting', startDateTime: '2024-01-15T09:00:00', endDateTime: '2024-01-15T10:00:00', hash: 'same' },
		];
		const newEvents = [
			{ summary: 'Meeting', startDateTime: '2024-01-15T09:00:00', endDateTime: '2024-01-15T10:00:00', hash: 'same' },
		];
		const merged = mergeAndSortEvents(existing, newEvents);
		expect(merged).toHaveLength(1);
	});
});

describe('appendEventsToContent', () => {
	it('should append events to existing content', () => {
		const content = '# Time Blocking\n';
		const events = [
			{ summary: 'Meeting', startDateTime: '2024-01-15T09:00:00', endDateTime: '2024-01-15T10:00:00' },
		];
		const result = appendEventsToContent(content, events);
		expect(result).toContain('09:00 - 10:00 Meeting');
	});

	it('should sort events before appending', () => {
		const content = '# Time Blocking\n';
		const events = [
			{ summary: 'Meeting', startDateTime: '2024-01-15T14:00:00', endDateTime: '2024-01-15T15:00:00' },
			{ summary: 'Call', startDateTime: '2024-01-15T09:00:00', endDateTime: '2024-01-15T10:00:00' },
		];
		const result = appendEventsToContent(content, events);
		const callIndex = result.indexOf('Call');
		const meetingIndex = result.indexOf('Meeting');
		expect(callIndex).toBeLessThan(meetingIndex);
	});
});

describe('formatEventForMarkdown', () => {
	it('should format event correctly', () => {
		const event = {
			summary: 'Meeting',
			startDateTime: '2024-01-15T09:00:00',
			endDateTime: '2024-01-15T10:00:00',
		};
		const result = formatEventForMarkdown(event);
		expect(result).toBe('- [ ] 09:00 - 10:00 Meeting');
	});
});

describe('generateDailyNotePath', () => {
	it('should generate path with folder', () => {
		const result = generateDailyNotePath('daily', '2024-01-15');
		expect(result).toBe('daily/2024-01-15.md');
	});

	it('should generate path without folder', () => {
		const result = generateDailyNotePath('', '2024-01-15');
		expect(result).toBe('2024-01-15.md');
	});
});