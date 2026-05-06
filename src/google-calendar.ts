import { requestUrl, RequestUrlParam } from 'obsidian';
import { OAuthTokens, getAuthHeader, isTokenExpired, refreshAccessToken, OAuthConfig } from './google-oauth';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarEvent {
    summary: string;
    startDateTime: string; // ISO string
    endDateTime: string;   // ISO string
    description?: string;
    hash?: string;
}

export function generateEventHash(startDateTime: string, endDateTime: string, summary: string, dateStr?: string): string {
    const normalizedStart = normalizeTimeForHash(startDateTime);
    const normalizedEnd = normalizeTimeForHash(endDateTime);
    const normalizedSummary = summary.trim().toLowerCase();
    const datePart = dateStr || extractDatePart(startDateTime);
    const hashInput = `${datePart}|${normalizedStart}|${normalizedEnd}|${normalizedSummary}`;
    return hashString(hashInput);
}

function normalizeTimeForHash(isoString: string): string {
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function extractDatePart(isoString: string): string {
    return isoString.split('T')[0] ?? '';
}

function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

export interface Calendar {
    id: string;
    summary: string;
    primary?: boolean;
}

export async function listCalendars(tokens: OAuthTokens, config: OAuthConfig): Promise<Calendar[]> {
    if (isTokenExpired(tokens) && tokens.refresh_token) {
        console.log('Token expired, refreshing...');
        const newTokens = await refreshAccessToken(tokens.refresh_token, config);
        tokens = { ...tokens, ...newTokens };
    }

    console.log('Fetching calendar list...');
    const response = await requestUrl({
        url: `${CALENDAR_API_BASE}/users/me/calendarList`,
        method: 'GET',
        headers: {
            'Authorization': getAuthHeader(tokens)
        }
    });

    if (response.status !== 200) {
        console.error('Failed to list calendars:', {
            status: response.status,
            body: response.text
        });
        throw new Error(`Failed to list calendars: ${response.status} - ${response.text}`);
    }

    const data = JSON.parse(response.text);
    console.log('Calendars retrieved:', data.items?.length || 0, 'calendars');
    return data.items || [];
}

export async function createEvent(
    tokens: OAuthTokens,
    config: OAuthConfig,
    calendarId: string,
    event: CalendarEvent
): Promise<any> {
    if (isTokenExpired(tokens)) {
        const newTokens = await refreshAccessToken(tokens.refresh_token!, config);
        tokens = { ...tokens, ...newTokens };
    }

    const eventBody = {
        summary: event.summary,
        description: event.description || '',
        start: {
            dateTime: event.startDateTime,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
            dateTime: event.endDateTime,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
    };

    const url = `${CALENDAR_API_BASE}/calendars/${calendarId}/events`;
    
    console.log('Creating Google Calendar event:', {
        calendarId,
        eventBody,
        url
    });

    try {
        // Use fetch directly to get full access to response even on error statuses
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeader(tokens),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventBody)
        });

        const responseText = await response.text();
        
        console.log('Google Calendar API response:', {
            status: response.status,
            statusText: response.statusText,
            responseText: responseText
        });

        if (response.status !== 200 && response.status !== 201) {
            let errorDetails = responseText || 'No response text';
            try {
                const parsedError = JSON.parse(responseText);
                console.error('Google API error details:', parsedError);
                errorDetails = JSON.stringify(parsedError, null, 2);
            } catch (e) {
                // Response is not JSON
            }
            throw new Error(`Failed to create event (${response.status}): ${errorDetails}`);
        }

        return JSON.parse(responseText);
    } catch (error: any) {
        console.error('Full error object:', error);
        if (error.stack) {
            console.error('Error stack:', error.stack);
        }
         throw error;
     }
 }


export function parseEventsFromContent(content: string, dateStr: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    
    console.log('Parsing events from content for date:', dateStr);
    console.log('Content length:', content.length);
    
    const timePattern = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(.+)/g;
    
    let match: RegExpExecArray | null;
    let matchCount = 0;
    while ((match = timePattern.exec(content)) !== null) {
        matchCount++;
        const startTime = (match[1] || '').trim();
        const endTime = (match[2] || '').trim();
        const summary = (match[3] || '').trim();
        
        console.log(`Found event ${matchCount}:`, { startTime, endTime, summary });
        
        const startDateTimeStr = `${dateStr}T${startTime}:00`;
        const endDateTimeStr = `${dateStr}T${endTime}:00`;
        
        const startDate = new Date(startDateTimeStr);
        const endDate = new Date(endDateTimeStr);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.error('Invalid date:', { startDateTimeStr, endDateTimeStr });
            continue;
        }
        
        console.log('Parsed event:', {
            summary,
            startDateTime: startDate.toISOString(),
            endDateTime: endDate.toISOString()
        });
        
        const hash = generateEventHash(startDate.toISOString(), endDate.toISOString(), summary, dateStr);
        console.log('Generated hash:', hash);
        
        events.push({
            summary,
            startDateTime: startDate.toISOString(),
            endDateTime: endDate.toISOString(),
            hash
        });
    }
    
    console.log(`Total events parsed: ${events.length}`);
    return events;
}

export function extractDateFromFilename(filename: string): string | null {
    const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
        return dateMatch[1] || null;
    }
    return null;
}

export async function getEventsFromGoogleCalendar(
    tokens: OAuthTokens,
    config: OAuthConfig,
    calendarId: string,
    startDate: string,
    endDate: string
): Promise<CalendarEvent[]> {
    if (isTokenExpired(tokens) && tokens.refresh_token) {
        const newTokens = await refreshAccessToken(tokens.refresh_token, config);
        tokens = { ...tokens, ...newTokens };
    }

    const params = new URLSearchParams({
        timeMin: `${startDate}T00:00:00Z`,
        timeMax: `${endDate}T23:59:59Z`,
        singleEvents: 'true',
        orderBy: 'startTime'
    });
    params.append('eventTypes', 'default');
    params.append('eventTypes', 'fromGmail');

    const url = `${CALENDAR_API_BASE}/calendars/${calendarId}/events?${params.toString()}`;
    
    console.log('Fetching Google Calendar events:', { calendarId, startDate, endDate, url });

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': getAuthHeader(tokens),
            'Content-Type': 'application/json'
        }
    });

    if (response.status !== 200) {
        const responseText = await response.text();
        console.error('Failed to get calendar events:', {
            status: response.status,
            responseText
        });
        throw new Error(`Failed to get calendar events: ${response.status}`);
    }

    const data = JSON.parse(await response.text());
    const events: CalendarEvent[] = [];

    if (data.items && data.items.length > 0) {
        for (const item of data.items) {
            const startDateTime = item.start?.dateTime || item.start?.date;
            const endDateTime = item.end?.dateTime || item.end?.date;
            
            if (startDateTime && endDateTime) {
                const hash = generateEventHash(startDateTime, endDateTime, item.summary || '');
                events.push({
                    summary: item.summary || '',
                    startDateTime,
                    endDateTime,
                    description: item.description,
                    hash
                });
            }
        }
    }

    console.log(`Retrieved ${events.length} events from Google Calendar`);
    return events;
}

export function formatEventForMarkdown(event: CalendarEvent): string {
    const startDate = new Date(event.startDateTime);
    const endDate = new Date(event.endDateTime);
    
    const fromTime = formatTime(startDate);
    const toTime = formatTime(endDate);
    
    return `- [ ] ${fromTime} - ${toTime} ${event.summary}`;
}

function formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

export function generateDailyNoteFilename(dateStr: string): string {
    return `${dateStr}.md`;
}

export function generateDailyNotePath(dailyNotesPath: string, dateStr: string): string {
    const filename = generateDailyNoteFilename(dateStr);
    return dailyNotesPath ? `${dailyNotesPath}/${filename}` : filename;
}

export function appendEventsToContent(content: string, events: CalendarEvent[]): string {
    const sortedEvents = [...events].sort((a, b) => {
        return new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime();
    });

    let newContent = content.trim();
    
    if (newContent && !newContent.endsWith('\n')) {
        newContent += '\n';
    }
    
    for (const event of sortedEvents) {
        newContent += '\n' + formatEventForMarkdown(event);
    }
    
    return newContent;
}

export function getEventsByDateMap(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
        const dateStr = new Date(event.startDateTime).toISOString().split('T')[0] ?? '';
        if (!map.has(dateStr)) {
            map.set(dateStr, []);
        }
        map.get(dateStr)!.push(event);
    }
    return map;
}

export function checkEventTextExists(content: string, event: CalendarEvent): boolean {
    const eventLine = formatEventForMarkdown(event);
    return content.includes(eventLine);
}

export function mergeAndSortEvents(existing: CalendarEvent[], newEvents: CalendarEvent[]): CalendarEvent[] {
    const allEvents = [...existing, ...newEvents];
    
    const uniqueEvents = allEvents.filter((event, index, self) => 
        index === self.findIndex(e => e.hash === event.hash)
    );
    
    return uniqueEvents.sort((a, b) => 
        new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
    );
}
