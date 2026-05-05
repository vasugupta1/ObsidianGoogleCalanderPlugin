import { requestUrl, RequestUrlParam } from 'obsidian';
import { OAuthTokens, getAuthHeader, isTokenExpired, refreshAccessToken, OAuthConfig } from './google-oauth';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarEvent {
    summary: string;
    startDateTime: string; // ISO string
    endDateTime: string;   // ISO string
    description?: string;
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
    
    // Regex to match time ranges like "09:00 - 10:00 Event name" or "9:00-10:00 Event"
    const timePattern = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(.+)/g;
    
    let match: RegExpExecArray | null;
    let matchCount = 0;
    while ((match = timePattern.exec(content)) !== null) {
        matchCount++;
        const startTime = (match[1] || '').trim();
        const endTime = (match[2] || '').trim();
        const summary = (match[3] || '').trim();
        
        console.log(`Found event ${matchCount}:`, { startTime, endTime, summary });
        
        // Construct ISO datetime strings
        const startDateTimeStr = `${dateStr}T${startTime}:00`;
        const endDateTimeStr = `${dateStr}T${endTime}:00`;
        
        const startDate = new Date(startDateTimeStr);
        const endDate = new Date(endDateTimeStr);
        
        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.error('Invalid date:', { startDateTimeStr, endDateTimeStr });
            continue;
        }
        
        console.log('Parsed event:', {
            summary,
            startDateTime: startDate.toISOString(),
            endDateTime: endDate.toISOString()
        });
        
        events.push({
            summary,
            startDateTime: startDate.toISOString(),
            endDateTime: endDate.toISOString()
        });
    }
    
    console.log(`Total events parsed: ${events.length}`);
    return events;
}

export function extractDateFromFilename(filename: string): string | null {
    // Match YYYY-MM-DD pattern
    const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
        return dateMatch[1] || null;
    }
    return null;
}
