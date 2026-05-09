import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	generateEventHash,
	generateSyncId,
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

describe('generateSyncId', () => {
	it('should generate unique IDs', () => {
		const id1 = generateSyncId();
		const id2 = generateSyncId();
		expect(id1).not.toBe(id2);
	});

	it('should start with obs_ prefix', () => {
		const id = generateSyncId();
		expect(id.startsWith('obs_')).toBe(true);
	});

	it('should contain timestamp', () => {
		const id = generateSyncId();
		const parts = id.split('_');
		expect(parts.length).toBeGreaterThanOrEqual(3);
	});
});

describe('syncId in parseEventsFromContent', () => {
	it('should parse event with syncId', () => {
		const content = `# Time Blocking

- [ ] 09:00 - 10:00 Meeting [syncId:obs_123_abc]
`;
		const events = parseEventsFromContent(content, '2024-01-15');
		expect(events).toHaveLength(1);
		expect(events[0].syncId).toBe('obs_123_abc');
	});

	it('should parse event without syncId', () => {
		const content = `# Time Blocking

- [ ] 09:00 - 10:00 Meeting
`;
		const events = parseEventsFromContent(content, '2024-01-15');
		expect(events).toHaveLength(1);
		expect(events[0].syncId).toBeUndefined();
	});

	it('should parse multiple events with mixed syncIds', () => {
		const content = `# Time Blocking

- [ ] 09:00 - 10:00 Meeting [syncId:obs_123_abc]
- [ ] 11:00 - 12:00 Call
- [ ] 14:00 - 15:00 Lunch [syncId:obs_456_def]
`;
		const events = parseEventsFromContent(content, '2024-01-15');
		expect(events).toHaveLength(3);
		expect(events[0].syncId).toBe('obs_123_abc');
		expect(events[1].syncId).toBeUndefined();
		expect(events[2].syncId).toBe('obs_456_def');
	});

	it('should still generate hash when syncId is present', () => {
		const content = `- [ ] 09:00 - 10:00 Meeting [syncId:obs_123_abc]`;
		const events = parseEventsFromContent(content, '2024-01-15');
		expect(events[0].hash).toBeDefined();
	});
});

describe('syncId in formatEventForMarkdown', () => {
	it('should include syncId when present', () => {
		const event = {
			summary: 'Meeting',
			startDateTime: '2024-01-15T09:00:00',
			endDateTime: '2024-01-15T10:00:00',
			syncId: 'obs_123_abc',
		};
		const result = formatEventForMarkdown(event);
		expect(result).toBe('- [ ] 09:00 - 10:00 Meeting [syncId:obs_123_abc]');
	});

	it('should not include syncId when not present', () => {
		const event = {
			summary: 'Meeting',
			startDateTime: '2024-01-15T09:00:00',
			endDateTime: '2024-01-15T10:00:00',
		};
		const result = formatEventForMarkdown(event);
		expect(result).toBe('- [ ] 09:00 - 10:00 Meeting');
	});

	it('should omit syncId when includeSyncId is false', () => {
		const event = {
			summary: 'Meeting',
			startDateTime: '2024-01-15T09:00:00',
			endDateTime: '2024-01-15T10:00:00',
			syncId: 'obs_123_abc',
		};
		const result = formatEventForMarkdown(event, false);
		expect(result).toBe('- [ ] 09:00 - 10:00 Meeting');
	});
});

describe('syncId in mergeAndSortEvents', () => {
	it('should deduplicate by hash, preserving events with syncId', () => {
		const existing: any[] = [
			{ summary: 'Meeting', startDateTime: '2024-01-15T09:00:00', endDateTime: '2024-01-15T10:00:00', hash: 'same', syncId: 'obs_1' },
		];
		const newEvents: any[] = [
			{ summary: 'Meeting Updated', startDateTime: '2024-01-15T09:00:00', endDateTime: '2024-01-15T10:00:00', hash: 'same', syncId: 'obs_2' },
		];
		const merged = mergeAndSortEvents(existing, newEvents);
		expect(merged).toHaveLength(1);
	});
});

describe('syncId roundtrip', () => {
	it('should preserve syncId through format and parse', () => {
		const originalEvent = {
			summary: 'Team Standup',
			startDateTime: '2024-01-15T09:00:00',
			endDateTime: '2024-01-15T09:30:00',
			syncId: 'obs_1705312200000_abc123',
		};
		
		const formatted = formatEventForMarkdown(originalEvent);
		expect(formatted).toContain('[syncId:obs_1705312200000_abc123]');
		
		const parsed = parseEventsFromContent(formatted, '2024-01-15');
		expect(parsed).toHaveLength(1);
		expect(parsed[0].syncId).toBe('obs_1705312200000_abc123');
		expect(parsed[0].summary).toBe('Team Standup');
	});

	it('should preserve syncId when appending events to content', () => {
		const events = [
			{
				summary: 'Meeting',
				startDateTime: '2024-01-15T09:00:00',
				endDateTime: '2024-01-15T10:00:00',
				syncId: 'obs_123_xyz',
			},
		];
		
		const content = '# Time Blocking\n';
		const result = appendEventsToContent(content, events);
		
		expect(result).toContain('[syncId:obs_123_xyz]');
		
		const parsed = parseEventsFromContent(result, '2024-01-15');
		expect(parsed[0].syncId).toBe('obs_123_xyz');
	});
});