const axios = require('axios');
const { JSDOM } = require('jsdom');
const querystring = require('querystring');
const { format, subDays } = require('date-fns');
const crypto = require('crypto');
const fs = require('fs');
const banner = `
        *      ███╗   ███╗███████╗████████╗██████╗ ██╗   ██╗███╗   ██╗      *
        *      ████╗ ████║██╔════╝╚══██╔══╝██╔══██╗██║   ██║████╗  ██║      *
        *      ██╔████╔██║███████╗   ██║   ██████╔╝██║   ██║██╔██╗ ██║      *
        *      ██║╚██╔╝██║╚════██║   ██║   ██╔══██╗╚██╗ ██╔╝██║╚██╗██║      *
        *      ██║ ╚═╝ ██║███████║   ██║   ██║  ██║ ╚████╔╝ ██║ ╚████║      *
        *      ╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝  ╚═══╝  ╚═╝  ╚═══╝      *
        *                                                                   *
        *          UNOFFICIAL API TECHCOMBANK  - DEVELOPED BY MSTRVN        *
        *                                                                   *
        *                    Author: MSTRVN.DEV                             *
        *********************************************************************
        `;
const USERNAME = '';
const PASSWORD = '';
const timeZone = 'Asia/Ho_Chi_Minh';

function getCurrentDateInHCM() {
    const now = new Date();
    
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    
    return vietnamTime;
}
function formatDateInHCM(date, dateFormat) {
    const vietnamTime = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    return format(vietnamTime, dateFormat);
}
async function main() {
  try {
      const { verifier, challenge } = generateCodeVerifierAndChallenge();
   console.log(banner);
      const initialUrl = `https://identity-tcb.techcombank.com.vn/auth/realms/backbase/protocol/openid-connect/auth?response_type=code&client_id=tcb-web-client&state=RnIyRWxKVk1md1FnUm5uYUJSdFRrQmNQbjBnMzlxZEZ2allwZHV6OGQ0anhS&redirect_uri=https%3A%2F%2Fonlinebanking.techcombank.com.vn%2Fredirect&scope=openid&code_challenge=${challenge}&code_challenge_method=S256&nonce=RnIyRWxKVk1md1FnUm5uYUJSdFRrQmNQbjBnMzlxZEZ2allwZHV6OGQ0anhS&ui_locales=en-US`;
      const resolvedUrl = await shortUrlBreaker(initialUrl);
      if (!resolvedUrl) throw new Error("Failed to break shortened URL");

      const step1Result = await resolveUrlAndGetCookies(resolvedUrl);
      if (!step1Result) throw new Error("Failed to resolve URL");

      const step2Result = await getLoginFormDetails(step1Result.url, step1Result.cookies);
      if (!step2Result) throw new Error("Failed to get login form details");

      const loginResponse = await submitLoginCredentials(
          step2Result.actionUrl,
          step2Result.formData,
          step2Result.cookies
      );
      if (!loginResponse) throw new Error("Failed to submit login credentials");

      const decodedUrl = extractDecodedUrl(loginResponse);
      if (!decodedUrl) throw new Error("Failed to extract decoded URL");
      const tokenData = await pollForConfirmation(decodedUrl, step2Result.cookies, verifier);
      console.log("Access Token:", tokenData.access_token);
      await fetchTransactions(tokenData.access_token);
  } catch (error) {
      console.error('Main process error:', error.message);
      throw error;
  }
}



async function shortUrlBreaker(url) {
    if (typeof url !== 'string') throw new Error('URL must be a string');
    
    console.log("Breaking shortened URL:", url);
    const response = await axios.get(url, {
        maxRedirects: 10,
        validateStatus: status => status >= 200 && status < 400,
        headers: { 'User-Agent': getUserAgent() }
    });
    return response.request.res.responseUrl || url;
}


async function resolveUrlAndGetCookies(url) {
    console.log("STEP 1: Resolving URL and collecting initial cookies...");
    
    const response = await axios.head(url, {
        maxRedirects: 10,
        validateStatus: status => status >= 200 && status < 400,
        headers: { 'User-Agent': getUserAgent() }
    });
    
    const finalUrl = response.request.res.responseUrl || url;
    const cookies = extractCookiesFromHeaders(response.headers);
    
    console.log("Resolved URL:", finalUrl);
    console.log("Cookies:", cookies.length > 0 ? cookies : "No cookies found");
    
    return { url: finalUrl, cookies };
}


async function getLoginFormDetails(url, cookies) {
    console.log("\nSTEP 2: Fetching login form details...");
    
    const response = await axios.get(url, {
        headers: {
            'User-Agent': getUserAgent(),
            'Cookie': cookies.join('; ')
        }
    });
    
    const newCookies = extractCookiesFromHeaders(response.headers);
    const actionUrl = extractFormActionUrl(response.data);
    if (!actionUrl) throw new Error("Could not find login form in HTML");
    
    const parsedUrl = new URL(actionUrl);
    const queryParams = Object.fromEntries(parsedUrl.searchParams);
    
    const formData = {
        session_code: queryParams.session_code || '',
        execution: queryParams.execution || '',
        client_id: queryParams.client_id || '',
        tab_id: queryParams.tab_id || '',
        kc_locale: queryParams.kc_locale || '',
        username: USERNAME,
        password: PASSWORD,
        threatMetrixBrowserType: 'DESKTOP_BROWSER'
    };
    
    console.log("Action URL:", actionUrl);
    console.log("New cookies:", newCookies);
    
    return {
        actionUrl,
        formData,
        cookies: [...cookies, ...newCookies]
    };
}


async function submitLoginCredentials(actionUrl, formData, cookies) {
    console.log("\nSTEP 3: Submitting login credentials...");
    
    const response = await axios.post(actionUrl,
        querystring.stringify(formData),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
                'User-Agent': getUserAgent(),
                'Cookie': cookies.join('; ')
            },
            maxRedirects: 0,
            validateStatus: status => status === 302 || (status >= 200 && status < 400)
        }
    );
    
    console.log("Login submission status:", response.status);
    return response.data;
}


function generateCodeVerifierAndChallenge() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const verifier = Array(60)
      .fill()
      .map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
      .join('');

  const hash = crypto.createHash('sha256').update(verifier).digest();
  const base64 = hash.toString('base64');
  const challenge = base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

  return { verifier, challenge };
}


async function pollForConfirmation(url, cookies, verifier) {
    console.log("\nSTEP 4: Polling for confirmation...");
    
    const postFields = "oob-authn-action=confirmation-poll";
    let currentUrl = url;
    const timeoutMs = 20000;
    const pollIntervalMs = 2000;
    const startTime = Date.now();
    let confirmedData;
  
    console.log("Using provided code_verifier:", verifier);
  
    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await axios.post(currentUrl, postFields, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': getUserAgent(),
                    'Cookie': cookies.join('; '),
                    'Origin': 'https://identity-tcb.techcombank.com.vn'
                }
            });
  
            const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
            console.log("Confirmation response:", data);
  
            if (data.status === "CONFIRMED") {
                console.log("Status confirmed!");
                confirmedData = data;
                break;
            } 
            
            if (data.status === "PENDING" && data.actionUrl) {
                currentUrl = data.actionUrl;
                console.log("Status PENDING, updating URL to:", currentUrl);
                await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                continue;
            }
  
            throw new Error(`Unexpected status: ${data.status || 'unknown'}`);
  
        } catch (error) {
            console.error("Polling error:", error.message);
            throw error;
        }
    }
  
    if (!confirmedData) {
        throw new Error("Confirmation polling timed out after 15 seconds");
    }
  
    console.log("\nSTEP 5: Sending confirmation-continue request...");
    
    if (!confirmedData.actionUrl) {
        throw new Error("No actionUrl found in CONFIRMED response");
    }
  
    const finalUrl = confirmedData.actionUrl;
    const finalPayload = "oob-authn-action=confirmation-continue";
    let location;
  
    try {
        const finalResponse = await axios.post(finalUrl, finalPayload, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': getUserAgent(),
                'Cookie': cookies.join('; '),
                'Origin': 'https://identity-tcb.techcombank.com.vn'
            },
            maxRedirects: 0,
            validateStatus: status => status === 302
        });
  
        location = finalResponse.headers['location'];
        if (!location) {
            throw new Error("No Location header found in final response");
        }
  
        console.log("Redirect location:", location);
    } catch (error) {
        console.error("Confirmation-continue request failed:", error.message);
        throw error;
    }
  
    console.log("\nSTEP 6: Following redirect with GET request...");
    let redirectResponse;
    try {
        redirectResponse = await axios.get(location, {
            headers: {
                'User-Agent': getUserAgent(),
                'Cookie': cookies.join('; '),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8'
            }
        });
  
        console.log("Redirect response status:", redirectResponse.status);
    } catch (error) {
        console.error("Redirect GET request failed:", error.message);
        throw error;
    }
  
    console.log("\nSTEP 7: Requesting access token...");
    
    const tokenUrl = "https://identity-tcb.techcombank.com.vn/auth/realms/backbase/protocol/openid-connect/token";
    const urlParams = new URL(location).searchParams;
    const code = urlParams.get('code');
  
    if (!code) {
        throw new Error("No authorization code found in redirect location");
    }
  
    const tokenPayload = querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: 'https://onlinebanking.techcombank.com.vn/redirect',
        code_verifier: verifier,
        client_id: 'tcb-web-client',
        ui_locales: 'en-US'
    });
  
    try {
        const tokenResponse = await axios.post(tokenUrl, tokenPayload, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'Origin': 'https://onlinebanking.techcombank.com.vn',
                'sec-fetch-site': 'same-site',
                'sec-fetch-mode': 'cors',
                'sec-fetch-dest': 'empty',
                'Referer': 'https://onlinebanking.techcombank.com.vn/',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'en-US,en;q=0.9,vi;q=0.8,zh-CN;q=0.7,zh;q=0.6',
                'priority': 'u=1, i'
            }
        });
  
        console.log("Token response:", tokenResponse.data);
        return tokenResponse.data;
  
    } catch (error) {
        console.error("Token request failed:", error.message);
        if (error.response) {
            console.error("Error details:", error.response.data);
        }
        throw error;
    }
  }

function getUserAgent() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
}

function extractDecodedUrl(html) {
  const regex = /<form[^>]*action="([^"]+)"/;
  const match = html.match(regex);
  
  if (match && match[1]) {
      let url = decodeURIComponent(match[1]);
      
      url = url.replace(/&amp;/g, '&');
      
      return url;
  }
  return null;
}

async function fetchTransactions(accessToken) {
    if (!accessToken || typeof accessToken !== 'string' || accessToken.trim() === '') {
        console.error('Invalid access token');
        return;
    }

    const currentDate = formatDateInHCM(getCurrentDateInHCM(), 'yyyy-MM-dd');
    const threeDaysAgo = formatDateInHCM(subDays(getCurrentDateInHCM(), 3), 'yyyy-MM-dd');

    const url = `https://onlinebanking.techcombank.com.vn/api/transaction-manager/client-api/v2/transactions?` +
        new URLSearchParams({
            bookingDateGreaterThan: threeDaysAgo,
            bookingDateLessThan: currentDate,
            arrangementId: "f95ed5e2-99d0-48b1-8af2-c8c619116c73",
            from: 0,
            size: 20
        }).toString();

    const headers = {
        "accept": "application/json",
        "authorization": `Bearer ${accessToken.trim()}`,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        "referer": "https://onlinebanking.techcombank.com.vn/",
        "accept-language": "en-US,en;q=0.9,vi;q=0.8,zh-CN;q=0.7,zh;q=0.6",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty"
    };

    try {
        const response = await axios.get(url, { headers });

        console.log("Transactions fetched successfully!");

        const transactions = response.data;
        fs.writeFileSync('transactions.json', JSON.stringify(transactions, null, 2));
        console.log("Transactions saved to transactions.json");

    } catch (error) {
        if (error.response) {
            console.log(`Failed to fetch data. HTTP Code: ${error.response.status}`);
        } else {
            console.error("Error: ", error.message);
        }
    }
}
function extractCookiesFromHeaders(headers) {
    return headers['set-cookie']?.map(cookie => cookie.split(';')[0]) || [];
}

function extractFormActionUrl(html) {
    const dom = new JSDOM(html);
    return dom.window.document.querySelector('form#kc-form-login')?.getAttribute('action') || null;
}


main().catch(error => console.error('Fatal error:', error.message));