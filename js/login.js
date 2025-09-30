// SPDX-FileCopyrightText: Hadad <hadad@linuxmail.org>
// SPDX-License-Identifier: Apache-2.0
import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app'; // إضافة App plugin لدعم deep linking

console.log('Login page script loaded at:', new Date().toISOString());
console.log('Capacitor available:', !!window.Capacitor);

const baseUrl = 'https://mgzon-mgzon-app.hf.space';

// UI elements
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const spinner = document.getElementById('spinner');
const errorMsg = document.getElementById('errorMsg');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const githubLoginBtn = document.getElementById('githubLoginBtn');

// Check authentication status on page load
async function checkAuthStatus() {
  try {
    const { value: token } = await Preferences.get({ key: 'token' });
    if (!token) {
      console.log('No auth token found');
      return false;
    }
    const response = await fetch(`${baseUrl}/api/verify-token`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (response.ok) {
      console.log('User is authenticated, redirecting to capacitor://localhost/chat.html');
      window.location.href = 'capacitor://localhost/chat.html';
      return true;
    } else {
      console.log('Token verification failed:', response.status);
      await Preferences.remove({ key: 'token' });
      return false;
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
    await Preferences.remove({ key: 'token' });
    return false;
  }
}

// Handle OAuth callback within the app
// Handle OAuth callback within the app
async function handleOAuthCallback(url, provider) {
    console.log(`Handling OAuth callback for ${provider}:`, url);
    try {
        const parsedUrl = new URL(url);
        const urlParams = new URLSearchParams(parsedUrl.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
            errorMsg.textContent = decodeURIComponent(error);
            errorMsg.classList.remove('hidden');
            console.error(`OAuth error from ${provider}:`, error);
            await Browser.close();
            return;
        }

        if (code) {
            console.log(`OAuth code received for ${provider}:`, code);
            const callbackEndpoint = provider === 'google' ? `${baseUrl}/auth/google/callback` : `${baseUrl}/auth/github/callback`;
            const response = await fetch(`${callbackEndpoint}?code=${code}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-Capacitor-App': 'true' // إضافة header لتحديد إن الطلب من التطبيق
                }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.access_token) {
                    await Preferences.set({ key: 'token', value: data.access_token });
                    console.log(`${provider} OAuth login successful, token saved`);
                    await LocalNotifications.schedule({
                        notifications: [
                            {
                                title: 'Login Successful',
                                body: `Welcome to MGZon Chatbot! Logged in with ${provider}.`,
                                id: 1,
                                schedule: { at: new Date(Date.now() + 1000) },
                                sound: 'default',
                                smallIcon: 'ic_stat_onesignal_default'
                            }
                        ]
                    });
                    await syncConversationsOnLogin();
                    await Browser.close();
                    console.log('Redirecting to capacitor://localhost/chat.html');
                    window.location.href = 'capacitor://localhost/chat.html';
                } else {
                    throw new Error(`No access token received from ${provider}`);
                }
            } else {
                const errorData = await response.json();
                errorMsg.textContent = errorData.detail || `Failed to complete ${provider} OAuth login`;
                errorMsg.classList.remove('hidden');
                console.error(`Failed to complete ${provider} OAuth login:`, errorData);
                await Browser.close();
            }
        } else {
            throw new Error('No OAuth code received');
        }
    } catch (error) {
        errorMsg.textContent = `Failed to process ${provider} login. Please try again.`;
        errorMsg.classList.remove('hidden');
        console.error(`Error processing ${provider} OAuth callback:`, error);
        await Browser.close();
    }
}
// Handle deep links for OAuth callback
async function setupDeepLinkListener() {
  if (window.Capacitor) {
    console.log('Setting up deep link listener');
    App.addListener('appUrlOpen', async (data) => {
      console.log('Deep link received:', data.url);
      const provider = data.url.includes('google') ? 'google' : 'github';
      await handleOAuthCallback(data.url, provider);
    });
  }
}

// Handle email/password login
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Login form submitted');
    if (!navigator.onLine) {
      errorMsg.textContent = 'You are offline. Please connect to the internet and try again.';
      errorMsg.classList.remove('hidden');
      return;
    }
    spinner.classList.remove('hidden');
    errorMsg.classList.add('hidden');
    const formData = new FormData(loginForm);
    try {
      const response = await fetch(`${baseUrl}/auth/jwt/login`, {
        method: 'POST',
        body: formData
      });
      spinner.classList.add('hidden');
      if (response.ok) {
        console.log('Login successful, redirecting to capacitor://localhost/chat.html');
        const data = await response.json();
        await Preferences.set({ key: 'token', value: data.access_token });
        await LocalNotifications.schedule({
          notifications: [
            {
              title: 'Login Successful',
              body: 'Welcome to MGZon Chatbot!',
              id: 1,
              schedule: { at: new Date(Date.now() + 1000) },
              sound: 'default',
              smallIcon: 'ic_stat_onesignal_default'
            }
          ]
        });
        await syncConversationsOnLogin();
        window.location.href = 'capacitor://localhost/chat.html';
      } else {
        const error = await response.json();
        errorMsg.textContent = error.detail || 'Login failed. Please try again.';
        errorMsg.classList.remove('hidden');
        console.error('Login failed:', error);
      }
    } catch (error) {
      spinner.classList.add('hidden');
      errorMsg.textContent = 'An error occurred. Please try again.';
      errorMsg.classList.remove('hidden');
      console.error('Error during login:', error);
    }
  });
}

// Handle Google OAuth login
if (googleLoginBtn) {
  googleLoginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('Google login button clicked at:', new Date().toISOString());
    spinner.classList.remove('hidden');
    errorMsg.classList.add('hidden');
    try {
      const response = await fetch(`${baseUrl}/auth/google/authorize`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      if (data.authorization_url) {
        console.log('Google authorization URL:', data.authorization_url);
        if (window.Capacitor) {
          console.log('Opening Google auth in in-app browser');
          await Browser.open({ url: data.authorization_url });
          Browser.addListener('browserFinished', async (info) => {
            console.log('In-app browser closed, handling Google callback:', info.url);
            await handleOAuthCallback(info.url, 'google');
            Browser.removeAllListeners('browserFinished');
          });
        } else {
          console.warn('Capacitor not available, redirecting to Google auth (web mode)');
          window.location.href = data.authorization_url;
        }
      } else {
        throw new Error('No Google authorization URL received');
      }
    } catch (error) {
      spinner.classList.add('hidden');
      errorMsg.textContent = 'Failed to initiate Google login. Please try again.';
      errorMsg.classList.remove('hidden');
      console.error('Error initiating Google login:', error);
    }
  });
}

// Handle GitHub OAuth login
if (githubLoginBtn) {
  githubLoginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('GitHub login button clicked at:', new Date().toISOString());
    spinner.classList.remove('hidden');
    errorMsg.classList.add('hidden');
    try {
      const response = await fetch(`${baseUrl}/auth/github/authorize`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      if (data.authorization_url) {
        console.log('GitHub authorization URL:', data.authorization_url);
        if (window.Capacitor) {
          console.log('Opening GitHub auth in in-app browser');
          await Browser.open({ url: data.authorization_url });
          Browser.addListener('browserFinished', async (info) => {
            console.log('In-app browser closed, handling GitHub callback:', info.url);
            await handleOAuthCallback(info.url, 'github');
            Browser.removeAllListeners('browserFinished');
          });
        } else {
          console.warn('Capacitor not available, redirecting to GitHub auth (web mode)');
          window.location.href = data.authorization_url;
        }
      } else {
        throw new Error('No GitHub authorization URL received');
      }
    } catch (error) {
      spinner.classList.add('hidden');
      errorMsg.textContent = 'Failed to initiate GitHub login. Please try again.';
      errorMsg.classList.remove('hidden');
      console.error('Error initiating GitHub login:', error);
    }
  });
}

// Check for error query parameters and deep links on page load
window.addEventListener('load', async () => {
  console.log('Page loaded, checking for auth status and OAuth callback');
  if (!navigator.onLine) {
    errorMsg.textContent = 'You are offline. Please connect to the internet and try again.';
    errorMsg.classList.remove('hidden');
    return;
  }
  await checkAuthStatus();
  await setupDeepLinkListener(); // إعداد deep link listener
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');
  const code = urlParams.get('code');
  if (error) {
    errorMsg.textContent = decodeURIComponent(error);
    errorMsg.classList.remove('hidden');
    console.error('OAuth error from URL:', error);
  } else if (code) {
    console.log('OAuth code detected in URL, processing callback');
    const provider = window.location.pathname.includes('google') ? 'google' : 'github';
    await handleOAuthCallback(window.location.href, provider);
  }
});

// Handle card details toggle
function showCardDetails(cardId) {
  console.log('Showing card details:', cardId);
  document.getElementById(`${cardId}-details`).classList.remove('hidden');
}

function closeCardDetails(cardId) {
  console.log('Closing card details:', cardId);
  document.getElementById(`${cardId}-details`).classList.add('hidden');
}
