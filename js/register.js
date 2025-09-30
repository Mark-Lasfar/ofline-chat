// SPDX-FileCopyrightText: Hadad <hadad@linuxmail.org>
// SPDX-License-Identifier: Apache-2.0
import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';

console.log('Register page script loaded at:', new Date().toISOString());

const baseUrl = 'https://mgzon-mgzon-app.hf.space';

// UI elements
const registerForm = document.getElementById('registerForm');
const registerBtn = document.getElementById('registerBtn');
const spinner = document.getElementById('spinner');
const errorMsg = document.getElementById('errorMsg');
const googleRegisterBtn = document.getElementById('googleRegisterBtn');
const githubRegisterBtn = document.getElementById('githubRegisterBtn');


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
      console.log('User is authenticated, redirecting to /chat');
      window.location.href = '/chat';
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
async function handleOAuthCallback(url, provider) {
  try {
    const urlParams = new URLSearchParams(new URL(url).search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    
    if (error) {
      errorMsg.textContent = decodeURIComponent(error);
      errorMsg.classList.remove('hidden');
      console.error(`OAuth error from ${provider}:`, error);
      return;
    }

    if (code) {
      console.log(`OAuth code received for ${provider}:`, code);
      const callbackEndpoint = provider === 'google' ? `${baseUrl}/auth/google/callback` : `${baseUrl}/auth/github/callback`;
      const response = await fetch(`${callbackEndpoint}?code=${code}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        await Preferences.set({ key: 'token', value: data.access_token });
        console.log(`${provider} OAuth registration successful, token saved, redirecting to /chat`);
        await LocalNotifications.schedule({
          notifications: [
            {
              title: 'Registration Successful',
              body: `Welcome to MGZon Chatbot! Registered with ${provider}.`,
              id: 1,
              schedule: { at: new Date(Date.now() + 1000) },
              sound: 'default',
              smallIcon: 'ic_stat_onesignal_default'
            }
          ]
        });
        window.location.href = '/chat';
      } else {
        const error = await response.json();
        errorMsg.textContent = error.detail || `Failed to complete ${provider} OAuth registration`;
        errorMsg.classList.remove('hidden');
        console.error(`Failed to complete ${provider} OAuth registration:`, error);
      }
    }
  } catch (error) {
    errorMsg.textContent = `Failed to process ${provider} registration. Please try again.`;
    errorMsg.classList.remove('hidden');
    console.error(`Error processing ${provider} OAuth callback:`, error);
  }
}

// Handle email/password registration
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Register form submitted');
    spinner.classList.remove('hidden');
    errorMsg.classList.add('hidden');
    const formData = new FormData(registerForm);
    try {
      const response = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        body: formData
      });
      spinner.classList.add('hidden');
      if (response.ok) {
        console.log('Registration successful, redirecting to /chat');
        const data = await response.json();
        await Preferences.set({ key: 'token', value: data.access_token });
        await LocalNotifications.schedule({
          notifications: [
            {
              title: 'Registration Successful',
              body: 'Welcome to MGZon Chatbot!',
              id: 1,
              schedule: { at: new Date(Date.now() + 1000) },
              sound: 'default',
              smallIcon: 'ic_stat_onesignal_default'
            }
          ]
        });
        window.location.href = '/chat';
      } else {
        const error = await response.json();
        errorMsg.textContent = error.detail || 'Registration failed. Please try again.';
        errorMsg.classList.remove('hidden');
        console.error('Registration failed:', error);
      }
    } catch (error) {
      spinner.classList.add('hidden');
      errorMsg.textContent = 'An error occurred. Please try again.';
      errorMsg.classList.remove('hidden');
      console.error('Error during registration:', error);
    }
  });
}

// Handle Google OAuth registration
if (googleRegisterBtn) {
  googleRegisterBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('Google registration button clicked');
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
        console.log('Opening in-app browser for Google:', data.authorization_url);
        await Browser.open({ url: data.authorization_url });
        Browser.addListener('browserFinished', async (info) => {
          console.log('Browser closed, handling Google OAuth callback:', info.url);
          await handleOAuthCallback(info.url, 'google');
          Browser.removeAllListeners('browserFinished');
        });
      } else {
        throw new Error('No authorization URL received');
      }
    } catch (error) {
      spinner.classList.add('hidden');
      errorMsg.textContent = 'Failed to initiate Google registration. Please try again.';
      errorMsg.classList.remove('hidden');
      console.error('Error initiating Google registration:', error);
    }
  });
}

// Handle GitHub OAuth registration
if (githubRegisterBtn) {
  githubRegisterBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('GitHub registration button clicked');
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
        console.log('Opening in-app browser for GitHub:', data.authorization_url);
        await Browser.open({ url: data.authorization_url });
        Browser.addListener('browserFinished', async (info) => {
          console.log('Browser closed, handling GitHub OAuth callback:', info.url);
          await handleOAuthCallback(info.url, 'github');
          Browser.removeAllListeners('browserFinished');
        });
      } else {
        throw new Error('No authorization URL received');
      }
    } catch (error) {
      spinner.classList.add('hidden');
      errorMsg.textContent = 'Failed to initiate GitHub registration. Please try again.';
      errorMsg.classList.remove('hidden');
      console.error('Error initiating GitHub registration:', error);
    }
  });
}

// Check for error query parameters on page load (for OAuth errors)
window.addEventListener('load', async () => {
  console.log('Page loaded, checking for auth status and OAuth callback');
  await checkAuthStatus();
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
