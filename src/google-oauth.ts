import { requestUrl } from 'obsidian';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

export interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    expires_at: number;
    token_type: string;
}

export interface OAuthConfig {
    client_id: string;
    client_secret?: string;
    redirect_uri: string;
}

export async function startOAuthFlow(config: OAuthConfig): Promise<void> {
    const params = new URLSearchParams({
        client_id: config.client_id,
        redirect_uri: config.redirect_uri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent'
    });
    
    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    window.open(authUrl, '_blank');
}

export async function exchangeCodeForTokens(
    code: string,
    config: OAuthConfig
): Promise<OAuthTokens> {
    const paramsObj: Record<string, string> = {
        client_id: config.client_id,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirect_uri
    };
    
    console.log('Config client_secret present:', !!config.client_secret);
    console.log('Config client_secret length:', config.client_secret?.length || 0);
    console.log('Using redirect_uri:', config.redirect_uri);
    
    if (config.client_secret) {
        paramsObj.client_secret = config.client_secret;
        console.log('Added client_secret to request');
    } else {
        console.warn('WARNING: client_secret is missing from config!');
    }
    
    const params = new URLSearchParams(paramsObj);
    
    console.log('Final request body:', params.toString());
    console.log('Code being sent (first 30 chars):', code.substring(0, 30));
    console.log('Full code length:', code.length);
    console.log('Code has whitespace at start/end:', code !== code.trim());

    const requestBody = params.toString();
    
    console.log('===== TOKEN EXCHANGE REQUEST =====');
    console.log('URL:', GOOGLE_TOKEN_URL);
    console.log('Method: POST');
    console.log('Headers:', {
        'Content-Type': 'application/x-www-form-urlencoded'
    });
    console.log('Request body:', requestBody);
    console.log('Decoded body:', {
        client_id: config.client_id,
        code: code.substring(0, 20) + '...',
        code_length: code.length,
        grant_type: 'authorization_code'
    });
    console.log('===================================');
    
    try {
        // Use fetch directly to get full access to response even on error statuses
        const response = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: requestBody
        });

        const responseText = await response.text();
        
        console.log('===== TOKEN EXCHANGE RESPONSE =====');
        console.log('Status:', response.status);
        console.log('Response text:', responseText);
        console.log('Response text length:', responseText?.length);
        console.log('====================================');
        
        if (response.status !== 200) {
            let errorDetails = responseText || 'No response text';
            let parsedError = null;
            try {
                parsedError = JSON.parse(responseText);
                errorDetails = JSON.stringify(parsedError, null, 2);
                console.error('Parsed error object:', parsedError);
                
                // Log specific Google error fields
                if (parsedError.error) {
                    console.error('Google error:', parsedError.error);
                    console.error('Google error description:', parsedError.error_description);
                }
            } catch (e) {
                console.error('Response is not JSON:', responseText);
            }
            console.error('Full error response:', errorDetails);
            throw new Error(`Token exchange failed (${response.status}): ${errorDetails}`);
        }
        
        const data = JSON.parse(responseText);
        
        console.log('Token exchange successful!');
        console.log('Has access_token:', !!data.access_token);
        console.log('Has refresh_token:', !!data.refresh_token);
        console.log('Expires in:', data.expires_in);
        
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + data.expires_in * 1000,
            token_type: data.token_type
        };
    } catch (error: unknown) {
        console.error('===== TOKEN EXCHANGE EXCEPTION =====');
        console.error('Error object:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        } else {
            console.error('Non-Error exception:', error);
        }
        console.error('=====================================');
        throw error;
    }
}

export async function refreshAccessToken(
    refreshToken: string,
    config: OAuthConfig
): Promise<OAuthTokens> {
    const params = new URLSearchParams({
        client_id: config.client_id,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
    });
    
    const response = await requestUrl({
        url: GOOGLE_TOKEN_URL,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
    });
    
    if (response.status !== 200) {
        throw new Error(`Token refresh failed: ${response.text}`);
    }
    
    const data = JSON.parse(response.text);
    
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        expires_at: Date.now() + data.expires_in * 1000,
        token_type: data.token_type
    };
}

export function isTokenExpired(tokens: OAuthTokens): boolean {
    return Date.now() >= tokens.expires_at - 60000;
}

export function getAuthHeader(tokens: OAuthTokens): string {
    return `${tokens.token_type} ${tokens.access_token}`;
}
