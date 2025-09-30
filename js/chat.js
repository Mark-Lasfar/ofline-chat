// SPDX-FileCopyrightText: Hadad <hadad@linuxmail.org>
// SPDX-License-Identifier: Apache-2.0
console.log('chat.js loaded successfully at:', new Date().toISOString());

const { VoiceRecorder } = Capacitor.Plugins;
const { Preferences } = Capacitor.Plugins;
const { Filesystem } = Capacitor.Plugins;
const Directory = { Assets: 'ASSETS' };

const onnx = window.onnx;
const AOS = window.AOS;
const ort = window.ort;

const decode = window.AudioDecoder;

// Prism for code highlighting
Prism.plugins.autoloader.languages_path = 'https://cdn.jsdelivr.net/npm/prismjs@1.30.0/components/';

Prism.plugins.lineNumbers = true; // تفعيل أرقام الأسطر
// Base URL for backend API
const baseUrl = 'https://mgzon-mgzon-app.hf.space';

// UI elements with fallback check
const uiElements = {
    chatArea: document.getElementById('chatArea') || document.createElement('div'),
    chatBox: document.getElementById('chatBox') || document.createElement('div'),
    initialContent: document.getElementById('initialContent') || document.createElement('div'),
    form: document.getElementById('footerForm') || document.createElement('form'),
    input: document.getElementById('userInput'),
    sendBtn: document.getElementById('sendBtn'),
    stopBtn: document.getElementById('stopBtn'),
    fileBtn: document.getElementById('fileBtn'),
    audioBtn: document.getElementById('audioBtn'),
    fileInput: document.getElementById('fileInput'),
    audioInput: document.getElementById('audioInput'),
    filePreview: document.getElementById('filePreview'),
    audioPreview: document.getElementById('audioPreview'),
    promptItems: document.querySelectorAll('.prompt-item'),
    chatHeader: document.getElementById('chatHeader'),
    clearBtn: document.getElementById('clearBtn'),
    messageLimitWarning: document.getElementById('messageLimitWarning'),
    conversationTitle: document.getElementById('conversationTitle'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebarToggle'),
    conversationList: document.getElementById('conversationList'),
    newConversationBtn: document.getElementById('newConversationBtn'),
    swipeHint: document.getElementById('swipeHint'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
    settingsForm: document.getElementById('settingsForm'),
    historyToggle: document.getElementById('historyToggle'),
};

// State variables
let conversationHistory = JSON.parse(sessionStorage.getItem('conversationHistory') || '[]');
let currentConversationId = window.conversationId || null;
let currentConversationTitle = window.conversationTitle || null;
let isRequestActive = false;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let streamMsg = null;
let currentAssistantText = '';
let isSidebarOpen = window.innerWidth >= 768;
let abortController = null;
let cachedTextModel = null;
let cachedAudioModel = null;

// دالة للتحقق من الاتصال بالإنترنت بشكل أكثر موثوقية
async function isOnline() {
    try {
        // استخدام عنوان يرجع 204 No Content للتحقق السريع دون تحميل محتوى
        const response = await fetch('https://www.google.com/generate_204', {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-store'
        });
        return true;
    } catch (err) {
        return false;
    }
}

async function checkModelFile(filePath) {
    if (await isOnline()) {
        console.log('Online mode: Skipping file check for', filePath);
        return true;
    }
    console.log(`Checking file at path: ${filePath}`);
    try {
        const response = await fetch(filePath);
        console.log(`Fetch response for ${filePath}:`, { status: response.status, ok: response.ok });
        if (response.ok) {
            console.log(`File found: ${filePath}`);
            return true;
        } else {
            console.error(`File not found at ${filePath}: ${response.status}`);
            return false;
        }
    } catch (err) {
        console.error(`Error checking file ${filePath}:`, err.message);
        return false;
    }
}

// تحميل نموذج Qwen2-0.5B-Instruct
async function loadLocalTextModel() {
    if (cachedTextModel) {
        console.log('Returning cached Qwen2-0.5B model');
        return cachedTextModel;
    }

    if (await isOnline()) {
        console.log('Online mode: Skipping local text model load');
        return null; // لو أونلاين، ما نحملش النموذج المحلي
    }

    try {
        const modelUrl = '/models/qwen2-0.5b-onnx/model.onnx';
        console.log('Loading Qwen2-0.5B model from:', modelUrl);

        // استخدام ORT لتحميل النموذج مباشرة من الـ WebView
        const session = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });

        cachedTextModel = session;
        console.log('✅ Local Qwen2-0.5B model loaded and cached!');
        return session;
    } catch (err) {
        console.error('❌ Error loading Qwen2-0.5B model:', err.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'فشل تحميل نموذج النصوص. الوضع الأوفلاين غير متاح.';
        }
        throw new Error('فشل تحميل نموذج Qwen2-0.5B: ' + err.message);
    }
}

async function loadLocalAudioModel() {
    if (cachedAudioModel) {
        console.log('Returning cached Whisper-tiny model');
        return cachedAudioModel;
    }

    if (await isOnline()) {
        console.log('Online mode: Skipping local audio model load');
        return null; // لو أونلاين، ما نحملش النموذج المحلي
    }

    try {
        const encoderModelUrl = '/models/whisper-tiny-onnx/encoder_model.onnx';
        const decoderModelUrl = '/models/whisper-tiny-onnx/decoder_model.onnx';
        console.log('Loading Whisper-tiny models from:', encoderModelUrl, decoderModelUrl);

        const encoderSession = await ort.InferenceSession.create(encoderModelUrl, { executionProviders: ['wasm'] });
        const decoderSession = await ort.InferenceSession.create(decoderModelUrl, { executionProviders: ['wasm'] });

        cachedAudioModel = { encoderSession, decoderSession };
        console.log('✅ Local Whisper-tiny models loaded and cached!');
        return cachedAudioModel;
    } catch (err) {
        console.error('❌ Error loading Whisper-tiny model:', err.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'فشل تحميل نموذج الصوت. الوضع الأوفلاين غير متاح.';
        }
        throw new Error('فشل تحميل نموذج Whisper-tiny: ' + err.message);
    }
}
// توليد رد نصي من النموذج المحلي
async function generateLocalTextResponse(message, model) {
    try {
        const input = new onnx.Tensor('string', [message]);
        const outputMap = await model.run([input]);
        const response = outputMap.values().next().value.data[0];
        return response || 'Error: No response generated locally.';
    } catch (err) {
        console.error('Error generating text response:', err.message);
        throw new Error('Failed to generate text response locally: ' + err.message);
    }
}


async function decodeWav(buffer) {
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(buffer);
    return audioBuffer.getChannelData(0);
}


// ترجمة صوت من النموذج المحلي
async function transcribeLocalAudio(audioBlob, model) {
    try {
        if (!audioBlob.type.startsWith('audio/wav') && !audioBlob.type.startsWith('audio/mp3')) {
            throw new Error('Audio format not supported. Please use WAV or MP3.');
        }
        const buffer = await audioBlob.arrayBuffer();
        let audioData;
        try {
            audioData = await decode(buffer); // AudioDecoder
        } catch (decodeErr) {
            console.warn('AudioDecoder failed, falling back to decodeWav');
            try {
                const channelData = await decodeWav(buffer);
                audioData = { getChannelData: () => channelData };
            } catch (fallbackErr) {
                throw new Error('Audio format not supported. Please use WAV or MP3.');
            }
        }
        const input = new ort.Tensor('float32', audioData.getChannelData(0));
        const encoderOutput = await model.encoderSession.run([input]);
        const encoderHiddenStates = encoderOutput.values().next().value;
        const decoderInput = new ort.Tensor('float32', encoderHiddenStates.data);
        const outputMap = await model.decoderSession.run([decoderInput]);
        const transcription = outputMap.values().next().value.data[0];
        return transcription || 'Error: No transcription generated.';
    } catch (err) {
        console.error('Error transcribing audio:', err.message);
        throw new Error('Failed to transcribe audio locally: ' + err.message);
    }
}


//  preloadModels 
async function preloadModels() {
    if (await isOnline()) {
        console.log('Online mode detected, skipping local model preload');
        return;
    }
    console.log('Offline mode detected, preloading local models');
    try {
        const textModelExists = await checkModelFile('/models/qwen2-0.5b-onnx/model.onnx');
        const audioEncoderExists = await checkModelFile('/models/whisper-tiny-onnx/encoder_model.onnx');
        const audioDecoderExists = await checkModelFile('/models/whisper-tiny-onnx/decoder_model.onnx');
        if (textModelExists && audioEncoderExists && audioDecoderExists) {
            await loadLocalTextModel();
            await loadLocalAudioModel();
            console.log('Local models preloaded and cached successfully');
        } else {
            console.warn('Some model files are missing, offline mode may be limited');
            if (uiElements.messageLimitWarning) {
                uiElements.messageLimitWarning.classList.remove('hidden');
                uiElements.messageLimitWarning.textContent = 'Some model files are missing. Offline mode may be limited.';
            }
        }
    } catch (err) {
        console.error('Failed to preload models:', err.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Failed to preload local models. Offline mode may be limited.';
        }
    }
}

//  DOMContentLoaded 
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded at:', new Date().toISOString());
    console.log('UI Elements:', Object.keys(uiElements).map(key => ({
        key,
        element: uiElements[key] ? uiElements[key].id || uiElements[key].tagName : null
    })));

    await updateSidebarAuthState();
    AOS.init({
        duration: 800,
        easing: 'ease-out-cubic',
        once: true,
        offset: 50,
    });

    enterChatView(true);

    if (await checkAuth() && currentConversationId) {
        console.log('Loading conversation with ID:', currentConversationId);
        await loadConversation(currentConversationId);
    } else if (!(await checkAuth()) && conversationHistory.length > 0) {
        console.log('Restoring conversation history from sessionStorage:', conversationHistory);
        conversationHistory.forEach(msg => {
            console.log('Adding message from history:', msg);
            addMsg(msg.role, msg.content);
        });
    } else {
        console.log('No conversation history or ID, starting fresh');
        if (uiElements.initialContent) {
            uiElements.initialContent.classList.remove('hidden');
            uiElements.initialContent.style.display = 'block';
            console.log('Showing initialContent on page load (no conversation)');
        }
    }

    await preloadModels(); // أضف هنا
    await syncLocalHistory();
    autoResizeTextarea();
    updateSendButtonState();
    if (uiElements.swipeHint) {
        uiElements.swipeHint.style.display = window.innerWidth < 768 ? 'block' : 'none';
        setTimeout(() => {
            uiElements.swipeHint.style.display = 'none';
        }, 3000);
    }
    setupTouchGestures();
});



// Check authentication token
async function checkAuth() {
    const { value: token } = await Preferences.get({ key: 'token' });
    if (!token) {
        console.log('No auth token found');
        return false;
    }
    try {
        const response = await fetch(`${baseUrl}/api/verify-token`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            console.log('Auth token verified');
            return true;
        } else {
            console.log('Token verification failed:', response.status);
            if (response.status === 401 || response.status === 403) {
                await Preferences.remove({ key: 'token' });
                if (uiElements.messageLimitWarning) {
                    uiElements.messageLimitWarning.classList.remove('hidden');
                    uiElements.messageLimitWarning.textContent = response.status === 403
                        ? 'Message limit reached. Please log in to continue.'
                        : 'Session expired. Please log in again.';
                }
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } else {
                // معالجة أخطاء أخرى (مثل 500)
                if (uiElements.messageLimitWarning) {
                    uiElements.messageLimitWarning.classList.remove('hidden');
                    uiElements.messageLimitWarning.textContent = 'Unable to verify session. Please try again later.';
                }
            }
            return false;
        }
    } catch (error) {
        console.error('Error verifying token:', error.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Error verifying session. Please check your connection.';
        }
        return false;
    }
}
// Handle session for non-logged-in users
async function handleSession() {
    const sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
        const newSessionId = crypto.randomUUID();
        sessionStorage.setItem('session_id', newSessionId);
        console.log('New session_id created:', newSessionId);
        return newSessionId;
    }
    console.log('Existing session_id:', sessionId);
    return sessionId;
}

// Update send button state
function updateSendButtonState() {
    if (uiElements.sendBtn && uiElements.input && uiElements.fileInput && uiElements.audioInput) {
        const hasInput = uiElements.input.value.trim() !== '' ||
            uiElements.fileInput.files.length > 0 ||
            uiElements.audioInput.files.length > 0;
        uiElements.sendBtn.disabled = !hasInput || isRequestActive || isRecording;
        console.log('Send button state updated:', { hasInput, isRequestActive, isRecording, disabled: uiElements.sendBtn.disabled });
    }
}

// Render markdown content with RTL support
async function renderMarkdown(el, isStreaming = false) {
    const raw = el.dataset.text || '';
    const lang = detectLanguage(raw);
    const isRTL = ['ar', 'he'].includes(lang); // اللغات التي تحتاج RTL
    const html = marked.parse(raw, {
        gfm: true,
        breaks: true,
        smartLists: true,
        smartypants: false,
        headerIds: false,
    });

    const extraClasses = isRTL ? 'rtl' : 'ltr';
    const wrapper = document.createElement('div');
    wrapper.className = `md-content ${extraClasses}`;
    wrapper.style.direction = isRTL ? 'rtl' : 'ltr';
    wrapper.style.textAlign = isRTL ? 'right' : 'left';

    el.innerHTML = '';
    el.appendChild(wrapper);

    if (isStreaming) {
        const words = html.split(/(<[^>]+>|[^\s<]+)/);
        wrapper.innerHTML = '';
        for (let i = 0; i < words.length; i++) {
            const span = document.createElement('span');
            span.innerHTML = words[i];
            wrapper.appendChild(span);
            if (!/<[^>]+>/.test(words[i])) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            if (uiElements.chatBox) {
                uiElements.chatBox.scrollTop = uiElements.chatBox.scrollHeight;
            }
        }
    } else {
        wrapper.innerHTML = html;
    }

    wrapper.querySelectorAll('table').forEach(t => {
        if (!t.parentNode.classList?.contains('table-wrapper')) {
            const div = document.createElement('div');
            div.className = 'table-wrapper';
            t.parentNode.insertBefore(div, t);
            div.appendChild(t);
        }
    });

    wrapper.querySelectorAll('pre').forEach(pre => {
        pre.classList.add('line-numbers');
        const code = pre.querySelector('code');
        if (code) {
            const language = code.className.match(/language-(\w+)/)?.[1] || 'text';
            code.className = `language-${language}`;
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>';
            copyBtn.title = 'Copy Code';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(code.innerText).then(() => {
                    copyBtn.innerHTML = '<span>Copied!</span>';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>';
                    }, 2000);
                });
            };
            pre.appendChild(copyBtn);
        }
    });

    wrapper.querySelectorAll('hr').forEach(h => h.classList.add('styled-hr'));
    Prism.highlightAllUnder(wrapper);
    Prism.plugins.fold.init();

    if (uiElements.chatBox) {
        uiElements.chatBox.scrollTo({
            top: uiElements.chatBox.scrollHeight,
            behavior: 'smooth',
        });
    }
    el.style.display = 'block';
}
// Toggle chat view with force option
function enterChatView(force = false) {
    if (uiElements.chatHeader) {
        uiElements.chatHeader.classList.remove('hidden');
        uiElements.chatHeader.setAttribute('aria-hidden', 'false');
        if (currentConversationTitle && uiElements.conversationTitle) {
            uiElements.conversationTitle.textContent = currentConversationTitle;
        }
    }
    if (uiElements.chatArea) {
        uiElements.chatArea.classList.remove('hidden');
        uiElements.chatArea.style.display = force ? 'flex !important' : 'flex';
        uiElements.chatArea.style.opacity = '1';
        uiElements.chatArea.style.visibility = 'visible';
    }
    if (uiElements.chatBox) {
        uiElements.chatBox.classList.remove('hidden');
        uiElements.chatBox.style.display = force ? 'flex !important' : 'flex';
        uiElements.chatBox.style.opacity = '1';
        uiElements.chatBox.style.visibility = 'visible';
    }
    // إخفاء initialContent فقط إذا كان هناك رسائل أو المحادثة بدأت
    if (uiElements.initialContent && (conversationHistory.length > 0 || currentConversationId)) {
        uiElements.initialContent.classList.add('hidden');
        uiElements.initialContent.style.display = 'none';
        console.log('Hiding initialContent in enterChatView');
    }
    if (uiElements.form) {
        uiElements.form.classList.remove('hidden');
        uiElements.form.style.display = force ? 'flex !important' : 'flex';
        uiElements.form.style.opacity = '1';
        uiElements.form.style.visibility = 'visible';
    }
    console.log('Chat view forced to enter:', {
        chatArea: uiElements.chatArea?.style.display,
        chatBox: uiElements.chatBox?.style.display,
        form: uiElements.form?.style.display
    });
}
// Toggle home view
function leaveChatView() {
    if (uiElements.chatHeader) {
        uiElements.chatHeader.classList.add('hidden');
        uiElements.chatHeader.setAttribute('aria-hidden', 'true');
    }
    if (uiElements.chatBox) uiElements.chatBox.classList.add('hidden');
    // إظهار initialContent فقط إذا كانت المحادثة فاضية
    if (uiElements.initialContent && conversationHistory.length === 0 && !currentConversationId) {
        uiElements.initialContent.classList.remove('hidden');
        uiElements.initialContent.style.display = 'block';
        console.log('Showing initialContent in leaveChatView');
    }
    if (uiElements.form) uiElements.form.classList.add('hidden');
}

// Add chat bubble

function addMsg(who, text) {
    const container = document.createElement('div');
    container.className = 'message-container';
    const div = document.createElement('div');
    const lang = detectLanguage(text);
    const isRTL = ['ar', 'he'].includes(lang);
    div.className = `bubble ${who === 'user' ? 'bubble-user' : 'bubble-assist'} ${isRTL ? 'rtl' : 'ltr'}`;
    div.dataset.text = text;
    console.log('Adding message:', { who, text, lang });

    renderMarkdown(div);
    div.style.display = 'block';

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>';
    copyBtn.title = 'Copy Response';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>';
            }, 2000);
        });
    };
    actions.appendChild(copyBtn);

    if (who === 'assistant') {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'action-btn';
        retryBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>';
        retryBtn.title = 'Retry';
        retryBtn.onclick = () => submitMessage();
        actions.appendChild(retryBtn);

        const speakBtn = document.createElement('button');
        speakBtn.className = 'action-btn';
        speakBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume1 size-4"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><path d="M16 9a5 5 0 0 1 0 6"></path></svg>';
        speakBtn.title = 'Read Aloud';
        speakBtn.onclick = () => speakText(text);
        actions.appendChild(speakBtn);

        const stopSpeakBtn = document.createElement('button');
        stopSpeakBtn.className = 'action-btn';
        stopSpeakBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12"></rect></svg>';
        stopSpeakBtn.title = 'Stop Reading';
        stopSpeakBtn.onclick = () => window.speechSynthesis.cancel();
        actions.appendChild(stopSpeakBtn);
    }

    if (who === 'user') {
        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn';
        editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
        editBtn.title = 'Edit Message';
        editBtn.onclick = () => editMessage(div, text, container);
        actions.appendChild(editBtn);
    }

    container.appendChild(div);
    container.appendChild(actions);
    if (uiElements.chatBox) {
        uiElements.chatBox.appendChild(container);
        uiElements.chatBox.scrollTop = uiElements.chatBox.scrollHeight;
        if (conversationHistory.length === 0 && uiElements.initialContent) {
            uiElements.initialContent.classList.add('hidden');
            uiElements.initialContent.style.display = 'none';
            console.log('Hiding initialContent as first message is added');
        }
    } else {
        console.error('chatBox not found, appending to a fallback container');
        document.body.appendChild(container);
    }

    if (who === 'user') {
        conversationHistory.push({ role: 'user', content: text });
        sessionStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
    }

    return div;
}

function editMessage(div, originalText, container) {
    const isRTL = ['ar', 'he'].includes(detectLanguage(originalText));
    div.innerHTML = '';

    const textarea = document.createElement('textarea');
    textarea.className = 'edit-textarea';
    textarea.value = originalText;
    textarea.style.direction = isRTL ? 'rtl' : 'ltr';
    textarea.style.textAlign = isRTL ? 'right' : 'left';
    textarea.style.width = '100%';
    textarea.style.minHeight = '100px';
    textarea.style.padding = '10px';
    textarea.style.border = '1px solid #ccc';
    textarea.style.borderRadius = '5px';
    textarea.style.resize = 'vertical';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'action-btn save-btn';
    saveBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>';
    saveBtn.title = 'Save Changes';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'action-btn cancel-btn';
    cancelBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>';
    cancelBtn.title = 'Cancel';

    const actions = document.createElement('div');
    actions.className = 'edit-actions';
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    actions.style.marginTop = '10px';
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);

    div.appendChild(textarea);
    div.appendChild(actions);

    textarea.focus();

    saveBtn.onclick = async () => {
        const newText = textarea.value.trim();
        if (newText && newText !== originalText) {
            div.dataset.text = newText;
            renderMarkdown(div);
            const index = conversationHistory.findIndex(msg => msg.role === 'user' && msg.content === originalText);
            if (index !== -1) {
                conversationHistory[index].content = newText;
                sessionStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
                // Remove the assistant's response (if any) after this message
                if (index + 1 < conversationHistory.length && conversationHistory[index + 1].role === 'assistant') {
                    conversationHistory.splice(index + 1, 1);
                    const nextMessage = container.nextSibling;
                    if (nextMessage) nextMessage.remove();
                }
                // Resubmit the edited message
                uiElements.input.value = newText;
                await submitMessage();
            }
        } else {
            // Revert to original message
            div.dataset.text = originalText;
            renderMarkdown(div);
        }
        // Restore original actions
        container.querySelector('.message-actions').style.display = 'flex';
        div.querySelector('.edit-actions').remove();
    };

    cancelBtn.onclick = () => {
        div.dataset.text = originalText;
        renderMarkdown(div);
        container.querySelector('.message-actions').style.display = 'flex';
        div.querySelector('.edit-actions').remove();
    };

    container.querySelector('.message-actions').style.display = 'none';
}

// Clear all messages
function clearAllMessages() {
    stopStream(true);
    conversationHistory = [];
    sessionStorage.removeItem('conversationHistory');
    currentAssistantText = '';
    if (streamMsg) {
        streamMsg.querySelector('.loading')?.remove();
        streamMsg = null;
    }
    if (uiElements.chatBox) uiElements.chatBox.innerHTML = '';
    if (uiElements.input) uiElements.input.value = '';
    if (uiElements.sendBtn) uiElements.sendBtn.disabled = true;
    if (uiElements.stopBtn) uiElements.stopBtn.style.display = 'none';
    if (uiElements.sendBtn) uiElements.sendBtn.style.display = 'inline-flex';
    if (uiElements.filePreview) uiElements.filePreview.style.display = 'none';
    if (uiElements.audioPreview) uiElements.audioPreview.style.display = 'none';
    if (uiElements.messageLimitWarning) uiElements.messageLimitWarning.classList.add('hidden');
    currentConversationId = null;
    currentConversationTitle = null;
    if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = 'MGZon AI Assistant';
    // إظهار initialContent بعد مسح المحادثة
    if (uiElements.initialContent) {
        uiElements.initialContent.classList.remove('hidden');
        uiElements.initialContent.style.display = 'block';
        console.log('Showing initialContent after clearing conversation');
    }
    leaveChatView();
    autoResizeTextarea();
}
// File preview
function previewFile() {
    if (uiElements.fileInput?.files.length > 0) {
        const file = uiElements.fileInput.files[0];
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = e => {
                if (uiElements.filePreview) {
                    uiElements.filePreview.innerHTML = `<img src="${e.target.result}" class="upload-preview">`;
                    uiElements.filePreview.style.display = 'block';
                }
                if (uiElements.audioPreview) uiElements.audioPreview.style.display = 'none';
                updateSendButtonState();
            };
            reader.readAsDataURL(file);
        }
    }
    if (uiElements.audioInput?.files.length > 0) {
        const file = uiElements.audioInput.files[0];
        if (file.type.startsWith('audio/')) {
            const reader = new FileReader();
            reader.onload = e => {
                if (uiElements.audioPreview) {
                    uiElements.audioPreview.innerHTML = `<audio controls src="${e.target.result}"></audio>`;
                    uiElements.audioPreview.style.display = 'block';
                }
                if (uiElements.filePreview) uiElements.filePreview.style.display = 'none';
                updateSendButtonState();
            };
            reader.readAsDataURL(file);
        }
    }
}

// Voice recording using Capacitor VoiceRecorder
async function startVoiceRecording() {
    if (isRequestActive || isRecording) {
        console.log('Voice recording blocked: Request active or already recording');
        return;
    }
    try {
        const { value: hasPermission } = await VoiceRecorder.requestAudioRecordingPermission();
        if (!hasPermission) {
            alert('Microphone permission denied.');
            return;
        }
        console.log('Starting voice recording...');
        isRecording = true;
        if (uiElements.sendBtn) uiElements.sendBtn.classList.add('recording');
        await VoiceRecorder.startRecording();
        console.log('Voice recording started');
    } catch (err) {
        console.error('Error starting recording:', err.message);
        alert('Failed to start recording: ' + err.message);
        isRecording = false;
        if (uiElements.sendBtn) uiElements.sendBtn.classList.remove('recording');
    }
}

async function stopVoiceRecording() {
    if (!isRecording) return;
    try {
        const result = await VoiceRecorder.stopRecording();
        console.log('Voice recording stopped');
        isRecording = false;
        if (uiElements.sendBtn) uiElements.sendBtn.classList.remove('recording');

        // التحقق من وجود recordDataBase64
        if (result && result.recordDataBase64) {
            console.log('Stopping voice recording, sending audio...');
            const audioData = result.recordDataBase64.split(',')[1];
            const audioBlob = base64ToBlob(audioData, 'audio/aac');
            const formData = new FormData();
            formData.append('file', audioBlob, 'voice-message.aac');
            await submitAudioMessage(formData);
        } else {
            console.warn('No audio data recorded, possibly cancelled');
            if (uiElements.messageLimitWarning) {
                uiElements.messageLimitWarning.classList.remove('hidden');
                uiElements.messageLimitWarning.textContent = 'Recording cancelled or no audio data captured.';
            }
        }
    } catch (err) {
        console.error('Error stopping recording:', err.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Failed to stop recording: ' + err.message;
        }
        isRecording = false;
        if (uiElements.sendBtn) uiElements.sendBtn.classList.remove('recording');
    }
}

function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}



async function syncLocalHistory() {
    if (!(await checkAuth())) {
        console.log('User not authenticated, skipping server sync');
        return;
    }
    const { value: token } = await Preferences.get({ key: 'token' });
    const localHistory = JSON.parse(localStorage.getItem('conversationHistory') || '[]');
    if (localHistory.length === 0) {
        console.log('No local history to sync');
        return;
    }

    try {
        console.log('Syncing local history with server...');
        const response = await fetch(`${baseUrl}/api/conversations/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Session-ID': await handleSession()
            },
            body: JSON.stringify({
                messages: localHistory,
                conversation_id: currentConversationId || null
            })
        });

        if (response.ok) {
            const data = await response.json();
            currentConversationId = data.conversation_id;
            currentConversationTitle = data.title || 'Synced Conversation';
            if (uiElements.conversationTitle) {
                uiElements.conversationTitle.textContent = currentConversationTitle;
            }
            localStorage.removeItem('conversationHistory'); // Clear local history after sync
            console.log('Local history synced successfully:', data);
            await loadConversations(); // Update sidebar
        } else {
            if (response.status === 401) {
                await Preferences.remove({ key: 'token' });
                window.location.href = '/login';
            }
            throw new Error(`Failed to sync local history: ${response.status}`);
        }
    } catch (err) {
        console.error('Error syncing local history:', err.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Failed to sync conversation history. It will be saved locally.';
        }
    }
}

// Send audio message
async function submitAudioMessage(formData) {
    if (uiElements.initialContent && !uiElements.initialContent.classList.contains('hidden')) {
        uiElements.initialContent.classList.add('hidden');
        uiElements.initialContent.style.display = 'none';
        console.log('Hiding initialContent before adding audio message');
    }
    enterChatView();
    addMsg('user', 'Voice message');
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        conversationHistory.push({ role: 'user', content: 'Voice message' });
        localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
    }
    streamMsg = addMsg('assistant', '');
    const loadingEl = document.createElement('span');
    loadingEl.className = 'loading';
    streamMsg.appendChild(loadingEl);
    updateUIForRequest();
    isRequestActive = true;
    abortController = new AbortController();
    try {
        let transcription;
        if (await isOnline()) {
            console.log('Online mode: Sending audio to server');
            if (currentConversationId) {
                formData.append('conversation_id', currentConversationId);
            }
            const response = await sendRequest(`${baseUrl}/api/audio-transcription`, formData);
            if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
            const data = await response.json();
            if (!data.transcription) throw new Error('No transcription received from server');
            transcription = data.transcription || 'Error: No transcription generated.';
            if (data.conversation_id) {
                currentConversationId = data.conversation_id;
                currentConversationTitle = data.conversation_title || 'Untitled Conversation';
                if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = currentConversationTitle;
                history.pushState(null, '', `/chat/${currentConversationId}`);
                await loadConversations();
            }
        } else {
            console.log('Offline mode: Using local audio model');
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'You are offline. Using local audio model.';
            const model = await loadLocalAudioModel();
            if (!model) throw new Error('Local audio model not available');
            const audioBlob = formData.get('file');
            transcription = await transcribeLocalAudio(audioBlob, model);
        }
        if (streamMsg) {
            streamMsg.dataset.text = transcription;
            renderMarkdown(streamMsg);
            streamMsg.dataset.done = '1';
        }
        if (isAuthenticated) {
            conversationHistory.push({ role: 'assistant', content: transcription });
            // Update localStorage
            const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
            const updatedConversations = localConversations.filter(conv => conv.id !== currentConversationId);
            updatedConversations.push({
                id: currentConversationId || crypto.randomUUID(),
                title: currentConversationTitle || 'Untitled Conversation',
                messages: conversationHistory
            });
            localStorage.setItem('conversations', JSON.stringify(updatedConversations));
        } else {
            conversationHistory.push({ role: 'assistant', content: transcription });
            localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
            // Update local conversations
            const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
            const updatedConversations = localConversations.filter(conv => conv.id !== currentConversationId);
            updatedConversations.push({
                id: currentConversationId || crypto.randomUUID(),
                title: currentConversationTitle || 'Untitled Conversation',
                messages: conversationHistory
            });
            localStorage.setItem('conversations', JSON.stringify(updatedConversations));
        }
        finalizeRequest();
    } catch (error) {
        handleRequestError(error);
    }
}
// Helper to send API requests

async function sendRequest(endpoint, body, headers = {}) {
    if (!(await isOnline())) {
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'You are offline. Please use local models.';
        }
        throw new Error('You are offline. Please use local models.');
    }
    const isAuthenticated = await checkAuth();
    const { value: token } = await Preferences.get({ key: 'token' });
    if (isAuthenticated && token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else if (!isAuthenticated && !token) {
        console.log('No auth token, proceeding as guest');
    } else {
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Session invalid. Please log in again.';
        }
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);
        throw new Error('Invalid session. Please log in again.');
    }
    headers['X-Session-ID'] = await handleSession();
    console.log('Sending request to:', endpoint, 'with headers:', headers);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            body,
            headers,
            signal: abortController?.signal,
        });
        if (!response.ok) {
            if (response.status === 403 || response.status === 401) {
                await Preferences.remove({ key: 'token' });
                if (uiElements.messageLimitWarning) {
                    uiElements.messageLimitWarning.classList.remove('hidden');
                    uiElements.messageLimitWarning.textContent = response.status === 403
                        ? 'Message limit reached. Please log in to continue.'
                        : 'Session expired. Please log in again.';
                }
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
                throw new Error(response.status === 403 ? 'Message limit reached' : 'Unauthorized');
            }
            if (response.status === 503) {
                throw new Error('Model not available. Please try another model.');
            }
            throw new Error(`Request failed with status ${response.status}`);
        }
        return response;
    } catch (error) {
        console.error('Send request error:', error.message);
        if (error.name === 'AbortError') {
            throw new Error('Request was aborted');
        }
        throw error;
    }
}

// Helper to update UI during request
function updateUIForRequest() {
    if (uiElements.stopBtn) uiElements.stopBtn.style.display = 'inline-flex';
    if (uiElements.sendBtn) uiElements.sendBtn.style.display = 'none';
    if (uiElements.input) uiElements.input.value = '';
    if (uiElements.sendBtn) uiElements.sendBtn.disabled = true;
    if (uiElements.filePreview) uiElements.filePreview.style.display = 'none';
    if (uiElements.audioPreview) uiElements.audioPreview.style.display = 'none';
    autoResizeTextarea();
}

// Helper to finalize request
function finalizeRequest() {
    streamMsg = null;
    isRequestActive = false;
    abortController = null;
    if (uiElements.sendBtn) {
        uiElements.sendBtn.style.display = 'inline-flex';
        uiElements.sendBtn.disabled = false;
    }
    if (uiElements.stopBtn) uiElements.stopBtn.style.display = 'none';
    updateSendButtonState();
}

// Helper to handle request errors
async function handleRequestError(error) {
    if (streamMsg) {
        streamMsg.querySelector('.loading')?.remove();
        streamMsg.dataset.text = `Error: ${error.message || 'An error occurred during the request.'}`;
        const retryBtn = document.createElement('button');
        retryBtn.innerText = 'Retry';
        retryBtn.className = 'retry-btn text-sm text-blue-400 hover:text-blue-600';
        retryBtn.onclick = () => submitMessage();
        streamMsg.appendChild(retryBtn);
        renderMarkdown(streamMsg);
        streamMsg.dataset.done = '1';
        streamMsg = null;
    }
    console.error('Request error:', error.message);
    let errorMessage = error.message || 'An error occurred during the request.';
    if (!(await isOnline())) {
        errorMessage = `Offline mode error: ${error.message || 'Failed to process request locally.'}`;
    }
    alert(errorMessage);
    isRequestActive = false;
    abortController = null;
    if (!(await checkAuth())) {
        localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
    }
    if (uiElements.sendBtn) {
        uiElements.sendBtn.style.display = 'inline-flex';
        uiElements.sendBtn.disabled = false;
    }
    if (uiElements.stopBtn) uiElements.stopBtn.style.display = 'none';
    enterChatView();
}

// Load conversations for sidebar
async function loadConversations() {
    if (!(await checkAuth())) {
        console.log('User not authenticated, loading local conversations');
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        if (uiElements.conversationList) {
            uiElements.conversationList.innerHTML = '';
            localConversations.forEach(conv => {
                const li = document.createElement('li');
                const lang = detectLanguage(conv.title);
                li.className = `flex items-center justify-between text-white hover:bg-gray-700 p-2 rounded cursor-pointer transition-colors ${conv.id === currentConversationId ? 'bg-gray-700' : ''}`;
                li.dataset.conversationId = conv.id;
                li.innerHTML = `
                    <div class="flex items-center flex-1" style="direction: ${['ar', 'he'].includes(lang) ? 'rtl' : 'ltr'};" data-conversation-id="${conv.id}">
                        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                        </svg>
                        <span class="truncate flex-1">${conv.title || 'Untitled Conversation'}</span>
                    </div>
                    <button class="delete-conversation-btn text-red-400 hover:text-red-600 p-1" title="Delete Conversation" data-conversation-id="${conv.id}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4M3 7h18"></path>
                        </svg>
                    </button>
                `;
                li.querySelector('[data-conversation-id]').addEventListener('click', () => loadConversation(conv.id));
                li.querySelector('.delete-conversation-btn').addEventListener('click', () => deleteConversation(conv.id));
                uiElements.conversationList.appendChild(li);
            });
        }
        return;
    }

    try {
        const { value: token } = await Preferences.get({ key: 'token' });
        const response = await fetch(`${baseUrl}/api/conversations`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            if (response.status === 401) {
                await Preferences.remove({ key: 'token' });
                window.location.href = '/login';
            }
            throw new Error(`Failed to load conversations: ${response.status}`);
        }
        const conversations = await response.json();
        if (uiElements.conversationList) {
            uiElements.conversationList.innerHTML = '';
            conversations.forEach(conv => {
                const li = document.createElement('li');
                const lang = detectLanguage(conv.title);
                li.className = `flex items-center justify-between text-white hover:bg-gray-700 p-2 rounded cursor-pointer transition-colors ${conv.conversation_id === currentConversationId ? 'bg-gray-700' : ''}`;
                li.dataset.conversationId = conv.conversation_id;
                li.innerHTML = `
                    <div class="flex items-center flex-1" style="direction: ${['ar', 'he'].includes(lang) ? 'rtl' : 'ltr'};" data-conversation-id="${conv.conversation_id}">
                        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                        </svg>
                        <span class="truncate flex-1">${conv.title || 'Untitled Conversation'}</span>
                    </div>
                    <button class="delete-conversation-btn text-red-400 hover:text-red-600 p-1" title="Delete Conversation" data-conversation-id="${conv.conversation_id}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4M3 7h18"></path>
                        </svg>
                    </button>
                `;
                li.querySelector('[data-conversation-id]').addEventListener('click', () => loadConversation(conv.conversation_id));
                li.querySelector('.delete-conversation-btn').addEventListener('click', () => deleteConversation(conv.conversation_id));
                uiElements.conversationList.appendChild(li);
            });
            // Save to localStorage for offline support
            localStorage.setItem('conversations', JSON.stringify(conversations.map(conv => ({
                id: conv.conversation_id,
                title: conv.title,
                messages: conv.messages
            }))));
        }
    } catch (error) {
        console.error('Error loading conversations:', error.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Failed to load conversations. Using local data.';
        }
        // Load local conversations if server fails
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        if (uiElements.conversationList) {
            uiElements.conversationList.innerHTML = '';
            localConversations.forEach(conv => {
                const li = document.createElement('li');
                const lang = detectLanguage(conv.title);
                li.className = `flex items-center justify-between text-white hover:bg-gray-700 p-2 rounded cursor-pointer transition-colors ${conv.id === currentConversationId ? 'bg-gray-700' : ''}`;
                li.dataset.conversationId = conv.id;
                li.innerHTML = `
                    <div class="flex items-center flex-1" style="direction: ${['ar', 'he'].includes(lang) ? 'rtl' : 'ltr'};" data-conversation-id="${conv.id}">
                        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                        </svg>
                        <span class="truncate flex-1">${conv.title || 'Untitled Conversation'}</span>
                    </div>
                    <button class="delete-conversation-btn text-red-400 hover:text-red-600 p-1" title="Delete Conversation" data-conversation-id="${conv.id}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4M3 7h18"></path>
                        </svg>
                    </button>
                `;
                li.querySelector('[data-conversation-id]').addEventListener('click', () => loadConversation(conv.id));
                li.querySelector('.delete-conversation-btn').addEventListener('click', () => deleteConversation(conv.id));
                uiElements.conversationList.appendChild(li);
            });
        }
    }
}


async function loadConversation(conversationId) {
    if (!(await checkAuth())) {
        console.log('User not authenticated, loading local conversation:', conversationId);
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        const conversation = localConversations.find(conv => conv.id === conversationId);
        if (!conversation) {
            console.error('Local conversation not found:', conversationId);
            if (uiElements.messageLimitWarning) {
                uiElements.messageLimitWarning.classList.remove('hidden');
                uiElements.messageLimitWarning.textContent = 'Conversation not found locally.';
            }
            return;
        }
        currentConversationId = conversationId;
        currentConversationTitle = conversation.title || 'Untitled Conversation';
        conversationHistory = conversation.messages || [];
        if (uiElements.chatBox) uiElements.chatBox.innerHTML = '';
        if (uiElements.initialContent && !uiElements.initialContent.classList.contains('hidden')) {
            uiElements.initialContent.classList.add('hidden');
            uiElements.initialContent.style.display = 'none';
            console.log('Hiding initialContent before loading local conversation');
        }
        conversationHistory.forEach(msg => addMsg(msg.role, msg.content));
        enterChatView();
        if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = currentConversationTitle;
        history.pushState(null, '', `/chat/${conversationId}`);
        toggleSidebar(false);
        return;
    }

    try {
        const { value: token } = await Preferences.get({ key: 'token' });
        const response = await fetch(`${baseUrl}/api/conversations/${conversationId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            if (response.status === 401) {
                await Preferences.remove({ key: 'token' });
                window.location.href = '/login';
            }
            throw new Error(`Failed to load conversation: ${response.status}`);
        }
        const data = await response.json();
        currentConversationId = data.conversation_id;
        currentConversationTitle = data.title || 'Untitled Conversation';
        conversationHistory = data.messages.map(msg => ({ role: msg.role, content: msg.content }));
        if (uiElements.chatBox) uiElements.chatBox.innerHTML = '';
        if (uiElements.initialContent && !uiElements.initialContent.classList.contains('hidden')) {
            uiElements.initialContent.classList.add('hidden');
            uiElements.initialContent.style.display = 'none';
            console.log('Hiding initialContent before loading conversation');
        }
        conversationHistory.forEach(msg => addMsg(msg.role, msg.content));
        enterChatView();
        if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = currentConversationTitle;
        history.pushState(null, '', `/chat/${conversationId}`);
        toggleSidebar(false);
        // Update localStorage
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        const updatedConversations = localConversations.filter(conv => conv.id !== conversationId);
        updatedConversations.push({
            id: data.conversation_id,
            title: data.title,
            messages: data.messages
        });
        localStorage.setItem('conversations', JSON.stringify(updatedConversations));
    } catch (error) {
        console.error('Error loading conversation:', error.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Failed to load conversation. Using local data.';
        }
        // Load from localStorage if server fails
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        const conversation = localConversations.find(conv => conv.id === conversationId);
        if (conversation) {
            currentConversationId = conversationId;
            currentConversationTitle = conversation.title || 'Untitled Conversation';
            conversationHistory = conversation.messages || [];
            if (uiElements.chatBox) uiElements.chatBox.innerHTML = '';
            if (uiElements.initialContent && !uiElements.initialContent.classList.contains('hidden')) {
                uiElements.initialContent.classList.add('hidden');
                uiElements.initialContent.style.display = 'none';
                console.log('Hiding initialContent before loading local conversation');
            }
            conversationHistory.forEach(msg => addMsg(msg.role, msg.content));
            enterChatView();
            if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = currentConversationTitle;
            history.pushState(null, '', `/chat/${conversationId}`);
            toggleSidebar(false);
        }
    }
}
// Delete conversation
async function deleteConversation(conversationId) {
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    if (!(await checkAuth())) {
        console.log('User not authenticated, deleting local conversation:', conversationId);
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        const updatedConversations = localConversations.filter(conv => conv.id !== conversationId);
        localStorage.setItem('conversations', JSON.stringify(updatedConversations));
        if (conversationId === currentConversationId) {
            clearAllMessages();
            currentConversationId = null;
            currentConversationTitle = null;
            history.pushState(null, '', '/chat');
        }
        await loadConversations();
        return;
    }

    try {
        const { value: token } = await Preferences.get({ key: 'token' });
        const response = await fetch(`${baseUrl}/api/conversations/${conversationId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            if (response.status === 401) {
                await Preferences.remove({ key: 'token' });
                window.location.href = '/login';
            }
            throw new Error(`Failed to delete conversation: ${response.status}`);
        }
        if (conversationId === currentConversationId) {
            clearAllMessages();
            currentConversationId = null;
            currentConversationTitle = null;
            history.pushState(null, '', '/chat');
        }
        // Update localStorage
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        const updatedConversations = localConversations.filter(conv => conv.id !== conversationId);
        localStorage.setItem('conversations', JSON.stringify(updatedConversations));
        await loadConversations();
    } catch (error) {
        console.error('Error deleting conversation:', error.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Failed to delete conversation. Using local data.';
        }
        // Delete locally if server fails
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        const updatedConversations = localConversations.filter(conv => conv.id !== conversationId);
        localStorage.setItem('conversations', JSON.stringify(updatedConversations));
        if (conversationId === currentConversationId) {
            clearAllMessages();
            currentConversationId = null;
            currentConversationTitle = null;
            history.pushState(null, '', '/chat');
        }
        await loadConversations();
    }
}
// Create new conversation
async function createNewConversation() {
    if (!(await checkAuth())) {
        console.log('User not authenticated, creating local conversation');
        const newConversationId = crypto.randomUUID();
        currentConversationId = newConversationId;
        currentConversationTitle = 'New Conversation';
        conversationHistory = [];
        localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        localConversations.push({
            id: newConversationId,
            title: currentConversationTitle,
            messages: []
        });
        localStorage.setItem('conversations', JSON.stringify(localConversations));
        if (uiElements.chatBox) uiElements.chatBox.innerHTML = '';
        if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = currentConversationTitle;
        history.pushState(null, '', `/chat/${currentConversationId}`);
        enterChatView();
        await loadConversations();
        toggleSidebar(false);
        return;
    }

    try {
        const { value: token } = await Preferences.get({ key: 'token' });
        const response = await fetch(`${baseUrl}/api/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ title: 'New Conversation' })
        });
        if (!response.ok) {
            if (response.status === 401) {
                await Preferences.remove({ key: 'token' });
                window.location.href = '/login';
            }
            throw new Error(`Failed to create conversation: ${response.status}`);
        }
        const data = await response.json();
        currentConversationId = data.conversation_id;
        currentConversationTitle = data.title;
        conversationHistory = [];
        localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
        if (uiElements.chatBox) uiElements.chatBox.innerHTML = '';
        if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = currentConversationTitle;
        history.pushState(null, '', `/chat/${currentConversationId}`);
        enterChatView();
        await loadConversations();
        toggleSidebar(false);
        // تحديث البيانات المحلية
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        localConversations.push({
            id: data.conversation_id,
            title: data.title,
            messages: []
        });
        localStorage.setItem('conversations', JSON.stringify(localConversations));
    } catch (error) {
        console.error('Error creating conversation:', error.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Failed to create new conversation. Creating locally.';
        }
        // إنشاء محادثة محلية لو فيه خطأ
        const newConversationId = crypto.randomUUID();
        currentConversationId = newConversationId;
        currentConversationTitle = 'New Conversation';
        conversationHistory = [];
        localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
        const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        localConversations.push({
            id: newConversationId,
            title: currentConversationTitle,
            messages: []
        });
        localStorage.setItem('conversations', JSON.stringify(localConversations));
        if (uiElements.chatBox) uiElements.chatBox.innerHTML = '';
        if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = currentConversationTitle;
        history.pushState(null, '', `/chat/${currentConversationId}`);
        enterChatView();
        await loadConversations();
        toggleSidebar(false);
    }
    if (uiElements.chatBox) uiElements.chatBox.scrollTo({
        top: uiElements.chatBox.scrollHeight,
        behavior: 'smooth',
    });
}


async function syncConversationsOnLogin() {
    if (!(await checkAuth())) {
        console.log('User not authenticated, skipping conversation sync');
        return;
    }
    const { value: token } = await Preferences.get({ key: 'token' });
    const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');

    if (localConversations.length === 0) {
        console.log('No local conversations to sync');
        return;
    }

    try {
        console.log('Syncing local conversations with server...');
        for (const conv of localConversations) {
            const response = await fetch(`${baseUrl}/api/conversations/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Session-ID': await handleSession()
                },
                body: JSON.stringify({
                    messages: conv.messages,
                    title: conv.title,
                    conversation_id: null // Server will generate new conversation_id
                })
            });
            if (!response.ok) {
                throw new Error(`Failed to sync conversation ${conv.id}: ${response.status}`);
            }
            const data = await response.json();
            console.log(`Synced conversation ${conv.id} to server with ID ${data.conversation_id}`);
        }
        localStorage.removeItem('conversations'); // Clear local conversations after sync
        await loadConversations(); // Update sidebar
        console.log('All local conversations synced successfully');
    } catch (err) {
        console.error('Error syncing conversations:', err.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Failed to sync conversations. They will be saved locally.';
        }
    }
}
async function checkAndSyncOnOnline() {
    if (!(await checkAuth())) {
        console.log('User not authenticated, skipping sync on online');
        return;
    }
    console.log('Device back online, checking for local conversations to sync');
    await syncLocalHistory();
    await syncConversationsOnLogin();
}

// Update conversation title
async function updateConversationTitle(conversationId, newTitle) {
    try {
        const { value: token } = await Preferences.get({ key: 'token' });
        const response = await fetch(`${baseUrl}/api/conversations/${conversationId}/title`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ title: newTitle })
        });
        if (!response.ok) {
            if (response.status === 401) {
                await Preferences.remove({ key: 'token' });
                window.location.href = '/login';
            }
            throw new Error('Failed to update title');
        }
        const data = await response.json();
        currentConversationTitle = data.title;
        if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = currentConversationTitle;
        await loadConversations();
    } catch (error) {
        console.error('Error updating title:', error.message);
        if (uiElements.messageLimitWarning) {
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'Failed to update conversation title.';
        }
    }
}
	
async function updateSidebarAuthState() {
    console.log('Updating sidebar auth state');
    const isAuthenticated = await checkAuth();
    console.log('isAuthenticated:', isAuthenticated);
    if (uiElements.settingsLi && uiElements.logoutLi && uiElements.loginLi && uiElements.conversationsSection) {
        console.log('Sidebar elements found:', {
            settingsLi: uiElements.settingsLi.id,
            logoutLi: uiElements.logoutLi.id,
            loginLi: uiElements.loginLi.id,
            conversationsSection: uiElements.conversationsSection.id
        });
        uiElements.settingsLi.style.display = isAuthenticated ? 'block' : 'none';
        uiElements.logoutLi.style.display = isAuthenticated ? 'block' : 'none';
        uiElements.loginLi.style.display = isAuthenticated ? 'none' : 'block';
        uiElements.conversationsSection.style.display = isAuthenticated ? 'block' : 'none';
    } else {
        console.error('Some sidebar elements are missing:', {
            settingsLi: !!uiElements.settingsLi,
            logoutLi: !!uiElements.logoutLi,
            loginLi: !!uiElements.loginLi,
            conversationsSection: !!uiElements.conversationsSection
        });
    }
}


// Toggle sidebar
function toggleSidebar(show) {
    if (uiElements.sidebar) {
        if (window.innerWidth >= 768) {
            isSidebarOpen = true;
            uiElements.sidebar.style.transform = 'translateX(0)';
            uiElements.sidebar.classList.add('active');
            if (uiElements.swipeHint) uiElements.swipeHint.style.display = 'none';
        } else {
            isSidebarOpen = show !== undefined ? show : !isSidebarOpen;
            uiElements.sidebar.style.transform = isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)';
            uiElements.sidebar.classList.toggle('active', isSidebarOpen);
            if (uiElements.swipeHint) {
                uiElements.swipeHint.style.display = isSidebarOpen ? 'none' : 'block';
                if (!isSidebarOpen) {
                    setTimeout(() => {
                        if (uiElements.swipeHint) uiElements.swipeHint.style.display = 'none';
                    }, 3000);
                }
            }
        }
        console.log('Sidebar toggled:', { isSidebarOpen });
    } else {
        console.error('Sidebar element not found');
    }
}


// Setup touch gestures with Hammer.js
function setupTouchGestures() {
    if (!uiElements.sidebar) {
        console.error('Sidebar element not found');
        return;
    }
    if (!uiElements.sidebar.offsetWidth) {
        console.error('Sidebar width is invalid');
        return;
    }
    const hammer = new Hammer(uiElements.sidebar, { touchAction: 'pan-x' });
    const mainContent = document.querySelector('.flex-1');
    if (!mainContent) {
        console.error('Main content element not found');
        return;
    }
    const hammerMain = new Hammer(mainContent, { touchAction: 'pan-x' });

    // السحب على الشريط الجانبي (لإغلاقه)
    hammer.get('pan').set({ direction: Hammer.DIRECTION_HORIZONTAL });
    hammer.on('pan', e => {
        if (!isSidebarOpen) return;
        let translateX = Math.max(-uiElements.sidebar.offsetWidth, Math.min(0, e.deltaX));
        uiElements.sidebar.style.transform = `translateX(${translateX}px)`;
        uiElements.sidebar.style.transition = 'none';
    });
    hammer.on('panend', e => {
        uiElements.sidebar.style.transition = 'transform 0.3s ease-in-out';
        if (e.deltaX < -50) {
            toggleSidebar(false); // إغلاق الشريط الجانبي
        } else {
            toggleSidebar(true); // إبقاء الشريط مفتوح
        }
    });

    // السحب على المحتوى الرئيسي (لفتحه)
    hammerMain.get('pan').set({ direction: Hammer.DIRECTION_HORIZONTAL });
    hammerMain.on('panstart', () => {
        if (isSidebarOpen) return;
        uiElements.sidebar.style.transition = 'none';
    });
    hammerMain.on('pan', e => {
        if (isSidebarOpen) return;
        let translateX = Math.min(uiElements.sidebar.offsetWidth, Math.max(0, e.deltaX));
        uiElements.sidebar.style.transform = `translateX(${translateX - uiElements.sidebar.offsetWidth}px)`;
    });
    hammerMain.on('panend', e => {
        uiElements.sidebar.style.transition = 'transform 0.3s ease-in-out';
        if (e.deltaX > 50) {
            toggleSidebar(true); // فتح الشريط الجانبي
        } else {
            toggleSidebar(false); // إغلاق الشريط الجانبي
        }
    });
}


async function speakText(text) {
    window.speechSynthesis.cancel(); // إلغاء أي صوت جاري

    const lang = detectLanguage(text); // اكتشاف اللغة
    const voiceVariant = document.getElementById('tts_voice')?.value || 'm1'; // اختيار الصوت

    // مسارات ملفات الصوت المحتملة
    const voicePaths = [
        lang.startsWith('en') ? `/tts/voices/en/${lang}.json` : `/tts/voices/${lang}.json`,
        `/mespeak/voices/${lang}.json`,
        `/espeak/espeak-data/voices/${lang}` // ملفات eSpeak ليست JSON، لكن بنستخدمها كبديل
    ];

    if (await isOnline()) {
        // أونلاين: استخدام Web Speech API
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            const langMap = {
                'ar': 'ar-SA',
                'en': 'en-US',
                'en-us': 'en-US',
                'en-gb': 'en-GB',
                'en-sc': 'en-GB', // الاسكتلندية تستخدم GB كبديل
                'fr': 'fr-FR',
                'es': 'es-ES',
                'es-la': 'es-MX', // الإسبانية اللاتينية
                'pt': 'pt-PT',
                'pt-pt': 'pt-PT',
                'de': 'de-DE',
                'it': 'it-IT',
                'cs': 'cs-CZ',
                'pl': 'pl-PL',
                'hu': 'hu-HU',
                'lv': 'lv-LV',
                'sv': 'sv-SE',
                'ro': 'ro-RO',
                'sk': 'sk-SK',
                'tr': 'tr-TR',
                'ru': 'ru-RU',
                'el': 'el-GR',
                'he': 'he-IL',
                'la': 'la-LA',
                'kn': 'kn-IN',
                'ca': 'ca-ES',
                'nl': 'nl-NL',
                'eo': 'eo-EO',
                'fi': 'fi-FI',
                'zh': 'zh-CN',
                'zh-yue': 'zh-HK'
            };
            utterance.lang = langMap[lang] || 'en-US';
            utterance.volume = 1;
            utterance.rate = 1;
            utterance.pitch = 1;
            window.speechSynthesis.speak(utterance);
            console.log(`TTS started (Online): lang=${utterance.lang}, text=${text}`);
        } catch (err) {
            console.error('Web Speech error:', err);
            uiElements.messageLimitWarning.textContent = 'خطأ في الصوت أونلاين.';
            uiElements.messageLimitWarning.classList.remove('hidden');
        }
    } else {
        // أوفلاين: استخدام meSpeak.js أو ESpeak.js
        try {
            let voiceLoaded = false;
            let voiceFile = null;

            // البحث عن ملف الصوت في المسارات
            for (const path of voicePaths) {
                if (await checkModelFile(path)) {
                    voiceFile = path;
                    voiceLoaded = true;
                    break;
                }
            }

            if (!voiceLoaded) {
                throw new Error(`Voice file for ${lang} not found in any path.`);
            }

            // تحديد ما إذا كان الملف من eSpeak (ليست JSON)
            if (voiceFile.startsWith('/espeak/espeak-data/voices/')) {
                // استخدام ESpeak.js
                if (typeof ESpeak !== 'undefined') {
                    ESpeak.loadVoice(voiceFile);
                    ESpeak.speak(text, { amplitude: 100, pitch: 50, speed: 150, variant: voiceVariant });
                    console.log(`TTS started (Offline, ESpeak): lang=${lang}, voiceFile=${voiceFile}, text=${text}`);
                } else {
                    throw new Error('ESpeak.js is not loaded.');
                }
            } else {
                // استخدام meSpeak.js
                if (typeof meSpeak !== 'undefined') {
                    meSpeak.loadVoice(voiceFile);
                    meSpeak.loadConfig(voiceFile.startsWith('/tts/') ? '/tts/tts_config.json' : '/mespeak/mespeak_config.json');
                    meSpeak.speak(text, { amplitude: 100, pitch: 50, speed: 150, variant: voiceVariant, wordgap: 3 });
                    console.log(`TTS started (Offline, meSpeak): lang=${lang}, voiceFile=${voiceFile}, text=${text}`);
                } else {
                    throw new Error('meSpeak.js is not loaded.');
                }
            }
        } catch (err) {
            console.error('TTS error:', err);
            uiElements.messageLimitWarning.textContent = `دعم ${lang} غير متاح أوفلاين. تأكد من وجود ملف الصوت.`;
            uiElements.messageLimitWarning.classList.remove('hidden');
        }
    }
}
// Send user message
async function submitMessage() {
    if (isRequestActive || isRecording) {
        console.log('Submit blocked: Request active or recording');
        return;
    }

    let message = uiElements.input?.value.trim() || '';
    let payload = null;
    let formData = null;
    let endpoint = `${baseUrl}/api/chat`;
    let headers = {};
    let inputType = null;
    let outputFormat = 'text';

    if (uiElements.fileInput?.files.length > 0) {
        const file = uiElements.fileInput.files[0];
        if (file.type.startsWith('image/')) {
            inputType = 'image';
            message = 'Analyze this image';
        }
    } else if (uiElements.audioInput?.files.length > 0) {
        const file = uiElements.audioInput.files[0];
        if (file.type.startsWith('audio/')) {
            inputType = 'audio';
            message = 'Transcribe this audio';
        }
    } else if (message) {
        inputType = 'text';
    }

    if (!inputType) {
        console.log('No message, file, or audio to send');
        return;
    }

    if (uiElements.initialContent && !uiElements.initialContent.classList.contains('hidden')) {
        uiElements.initialContent.classList.add('hidden');
        uiElements.initialContent.style.display = 'none';
        console.log('Hiding initialContent before adding message');
    }

    enterChatView();
    addMsg('user', inputType === 'text' ? message : inputType === 'image' ? '📷 Image uploaded' : '🎤 Audio uploaded');

    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        conversationHistory.push({ role: 'user', content: message });
        localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
    }

    streamMsg = addMsg('assistant', '');
    const thinkingEl = document.createElement('span');
    thinkingEl.className = 'thinking';
    thinkingEl.textContent = 'The model is thinking...';
    streamMsg.appendChild(thinkingEl);
    updateUIForRequest();

    isRequestActive = true;
    abortController = new AbortController();
    const startTime = Date.now();

    try {
        let responseText = '';

        if (await isOnline() && isAuthenticated) {
            console.log('Online mode: Preparing request for inputType:', inputType);
            if (inputType === 'image') {
                endpoint = `${baseUrl}/api/image-analysis`;
                formData = new FormData();
                formData.append('file', uiElements.fileInput.files[0]);
                formData.append('output_format', outputFormat);
                if (currentConversationId) {
                    formData.append('conversation_id', currentConversationId);
                }
            } else if (inputType === 'audio') {
                endpoint = `${baseUrl}/api/audio-transcription`;
                formData = new FormData();
                formData.append('file', uiElements.audioInput.files[0]);
                if (currentConversationId) {
                    formData.append('conversation_id', currentConversationId);
                }
            } else if (inputType === 'text') {
                const lang = detectLanguage(message);
                const systemPrompts = {
                    'ar': 'أنت مساعد ذكي تقدم إجابات مفصلة ومنظمة باللغة العربية، مع ضمان الدقة والوضوح.',
                    'en': 'You are an expert assistant providing detailed, comprehensive, and well-structured responses.',
                    'en-us': 'You are an expert assistant providing detailed, comprehensive, and well-structured responses in American English.',
                    'en-gb': 'You are an expert assistant providing detailed, comprehensive, and well-structured responses in British English.',
                    'en-sc': 'You are an expert assistant providing detailed, comprehensive, and well-structured responses in Scottish English.',
                    'fr': 'Vous êtes un assistant expert fournissant des réponses détaillées, complètes et bien structurées.',
                    'es': 'Eres un asistente experto que proporciona respuestas detalladas, completas y bien estructuradas.',
                    'es-la': 'Eres un asistente experto que proporciona respuestas detalladas, completas y bien estructuradas en español latinoamericano.',
                    'pt': 'Você é um assistente especialista que fornece respostas detalhadas, completas e bem estruturadas.',
                    'pt-pt': 'Você é um assistente especialista que fornece respostas detalhadas, completas e bem estruturadas em português europeu.',
                    'de': 'Sie sind ein Expertenassistent, der detaillierte, umfassende und gut strukturierte Antworten liefert.',
                    'it': 'Sei un assistente esperto che fornisce risposte dettagliate, complete e ben strutturate.',
                    'cs': 'Jste odborný asistent, který poskytuje podrobné, úplné a dobře strukturované odpovědi.',
                    'pl': 'Jesteś ekspertem asystentem, który dostarcza szczegółowych, kompleksowych i dobrze zorganizowanych odpowiedzi.',
                    'hu': 'Ön egy szakértő asszisztens, aki részletes, átfogó és jól strukturált válaszokat ad.',
                    'lv': 'Jūs esat ekspertu asistents, kas sniedz detalizētas, visaptverošas un labi strukturētas atbildes.',
                    'sv': 'Du är en expertassistent som ger detaljerade, omfattande och välstrukturerade svar.',
                    'ro': 'Ești un asistent expert care oferă răspunsuri detaliate, complete și bine structurate.',
                    'sk': 'Ste odborný asistent, ktorý poskytuje podrobné, komplexné a dobre štruktúrované odpovede.',
                    'tr': 'Ayrıntılı, kapsamlı ve iyi yapılandırılmış yanıtlar veren bir uzman asistanısınız.',
                    'ru': 'Вы эксперт-помощник, предоставляющий подробные, всесторонние и хорошо структурированные ответы.',
                    'el': 'Είσαι ένας ειδικός βοηθός που παρέχει λεπτομερείς, ολοκληρωμένες και καλά δομημένες απαντήσεις.',
                    'he': 'אתה עוזר מומחה שמספק תשובות מפורטות, מקיפות ומאורגנות היטב.',
                    'la': 'Es assistens peritus qui responsa accurata, comprehensiva et bene ordinata praebet.',
                    'kn': 'ನೀವು ವಿವರವಾದ, ಸಮಗ್ರ ಮತ್ತು ಚೆನ್ನಾಗಿ ರಚಿತ ಉತ್ತರಗಳನ್ನು ಒದಗಿಸುವ ತಜ್ಞ ಸಹಾಯಕರಾಗಿದ್ದೀರಿ.',
                    'ca': 'Ets un assistent expert que proporciona respostes detallades, completes i ben estructurades.',
                    'nl': 'Je bent een deskundige assistent die gedetailleerde, uitgebreide en goed gestructureerde antwoorden geeft.',
                    'eo': 'Vi estas sperta asistanto, kiu provizas detalan, ampleksan kaj bone strukturitan respondojn.',
                    'fi': 'Olet asiantuntija-assistentti, joka antaa yksityiskohtaisia, kattavia ja hyvin jäsenneltyjä vastauksia.',
                    'zh': '你是一个提供详细、全面且结构良好的回答的专家助手。',
                    'zh-yue': '你係一個提供詳細、全面同結構良好嘅回應嘅專家助手。'
                };
                payload = {
                    message,
                    system_prompt: systemPrompts[lang] || systemPrompts['en'],
                    history: conversationHistory,
                    temperature: 0.7,
                    max_new_tokens: 128000,
                    enable_browsing: true,
                    output_format: 'text',
                    conversation_id: currentConversationId || null
                };
                headers['Content-Type'] = 'application/json';
            }

            const response = await sendRequest(endpoint, payload ? JSON.stringify(payload) : formData, headers);
            const contentType = response.headers.get('Content-Type');

            if (contentType?.includes('application/json')) {
                const data = await response.json();
                responseText = data.response || 'Error: No response generated.';
                if (data.conversation_id) {
                    currentConversationId = data.conversation_id;
                    currentConversationTitle = data.conversation_title || 'Untitled Conversation';
                    if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = currentConversationTitle;
                    history.pushState(null, '', `/chat/${currentConversationId}`);
                    await loadConversations();
                }
                streamMsg.dataset.text = responseText;
                streamMsg.querySelector('.thinking')?.remove();
                renderMarkdown(streamMsg);
                if (isAuthenticated) {
                    conversationHistory.push({ role: 'user', content: message });
                    conversationHistory.push({ role: 'assistant', content: responseText });
                    // Update localStorage
                    const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
                    const updatedConversations = localConversations.filter(conv => conv.id !== currentConversationId);
                    updatedConversations.push({
                        id: currentConversationId,
                        title: currentConversationTitle,
                        messages: conversationHistory
                    });
                    localStorage.setItem('conversations', JSON.stringify(updatedConversations));
                }
            } else if (contentType?.includes('text/plain')) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                streamMsg.dataset.text = '';
                streamMsg.querySelector('.thinking')?.remove();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        if (!buffer.trim()) throw new Error('Empty response from server');
                        break;
                    }
                    const chunk = decoder.decode(value, { stream: true });
                    console.log('Received chunk:', chunk);

                    try {
                        const jsonData = JSON.parse(chunk);
                        if (jsonData.conversation_id) {
                            currentConversationId = jsonData.conversation_id;
                            currentConversationTitle = jsonData.conversation_title || 'Untitled Conversation';
                            if (uiElements.conversationTitle) uiElements.conversationTitle.textContent = currentConversationTitle;
                            history.pushState(null, '', `/chat/${currentConversationId}`);
                            await loadConversations();
                            continue;
                        }
                    } catch (e) {
                        buffer += chunk;
                        responseText += chunk;
                        if (streamMsg) {
                            streamMsg.dataset.text = buffer;
                            currentAssistantText = buffer;
                            renderMarkdown(streamMsg, true);
                            streamMsg.style.opacity = '1';
                            if (uiElements.chatBox) {
                                uiElements.chatBox.style.display = 'flex';
                                uiElements.chatBox.scrollTop = uiElements.chatBox.scrollHeight;
                            }
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                }
                if (isAuthenticated) {
                    conversationHistory.push({ role: 'user', content: message });
                    conversationHistory.push({ role: 'assistant', content: responseText });
                    // Update localStorage
                    const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
                    const updatedConversations = localConversations.filter(conv => conv.id !== currentConversationId);
                    updatedConversations.push({
                        id: currentConversationId,
                        title: currentConversationTitle,
                        messages: conversationHistory
                    });
                    localStorage.setItem('conversations', JSON.stringify(updatedConversations));
                }
            } else {
                throw new Error(`Unsupported Content-Type: ${contentType}`);
            }
        } else {
            console.log('Offline mode detected, using local model for inputType:', inputType);
            uiElements.messageLimitWarning.classList.remove('hidden');
            uiElements.messageLimitWarning.textContent = 'You are offline. Using local model.';

            if (inputType === 'text') {
                console.log('Loading local text model for message:', message);
                const model = await loadLocalTextModel();
                if (!model) throw new Error('Local text model not available');
                responseText = await generateLocalTextResponse(message, model);
            } else if (inputType === 'audio') {
                console.log('Loading local audio model for transcription');
                const model = await loadLocalAudioModel();
                if (!model) throw new Error('Local audio model not available');
                const audioFile = uiElements.audioInput.files[0];
                responseText = await transcribeLocalAudio(audioFile, model);
            } else {
                responseText = 'Offline mode only supports text and audio inputs.';
            }
            streamMsg.dataset.text = responseText;
            streamMsg.querySelector('.thinking')?.remove();
            renderMarkdown(streamMsg);
            conversationHistory.push({ role: 'user', content: message });
            conversationHistory.push({ role: 'assistant', content: responseText });
            localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
            // Update local conversations
            const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
            const updatedConversations = localConversations.filter(conv => conv.id !== currentConversationId);
            updatedConversations.push({
                id: currentConversationId || crypto.randomUUID(),
                title: currentConversationTitle || 'Untitled Conversation',
                messages: conversationHistory
            });
            localStorage.setItem('conversations', JSON.stringify(updatedConversations));
        }

        const endTime = Date.now();
        const thinkingTime = Math.round((endTime - startTime) / 1000);
        streamMsg.dataset.text = responseText + `\n\n*Processed in ${thinkingTime} seconds.*`;
        renderMarkdown(streamMsg);
        streamMsg.dataset.done = '1';

        finalizeRequest();
    } catch (error) {
        console.error('Submit message error:', error);
        handleRequestError(error);
    }
}

// Stop streaming
function stopStream(forceCancel = false) {
    if (!isRequestActive && !isRecording) return;
    if (isRecording) stopVoiceRecording();
    isRequestActive = false;
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    if (streamMsg && !forceCancel) {
        streamMsg.querySelector('.loading')?.remove();
        streamMsg.dataset.text += '';
        renderMarkdown(streamMsg);
        streamMsg.dataset.done = '1';
        streamMsg = null;
    }
    if (uiElements.stopBtn) uiElements.stopBtn.style.display = 'none';
    if (uiElements.sendBtn) uiElements.sendBtn.style.display = 'inline-flex';
    if (uiElements.stopBtn) uiElements.stopBtn.style.pointerEvents = 'auto';
    enterChatView();
}

// Logout handler
const logoutBtn = document.querySelector('#logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        console.log('Logout button clicked');
        try {
            const { value: token } = await Preferences.get({ key: 'token' });
            const response = await fetch(`${baseUrl}/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include'
            });
            if (response.ok) {
                await Preferences.remove({ key: 'token' });
                console.log('Token removed from Preferences');
                window.location.href = '/login';
            } else {
                console.error('Logout failed:', response.status);
                if (uiElements.messageLimitWarning) {
                    uiElements.messageLimitWarning.classList.remove('hidden');
                    uiElements.messageLimitWarning.textContent = 'Failed to log out. Please try again.';
                }
            }
        } catch (error) {
            console.error('Logout error:', error.message);
            if (uiElements.messageLimitWarning) {
                uiElements.messageLimitWarning.classList.remove('hidden');
                uiElements.messageLimitWarning.textContent = 'Error during logout: ' + error.message;
            }
        }
    });
}
// Settings Modal
if (uiElements.settingsBtn) {
    uiElements.settingsBtn.addEventListener('click', async () => {
        if (!(await checkAuth())) {
            if (uiElements.messageLimitWarning) {
                uiElements.messageLimitWarning.classList.remove('hidden');
                uiElements.messageLimitWarning.textContent = 'Please log in to access settings.';
            }
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
            return;
        }
        try {
            const { value: token } = await Preferences.get({ key: 'token' });
            const response = await fetch(`${baseUrl}/api/settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {

                throw new Error(`Failed to fetch settings: ${response.status}`);
            }
            const data = await response.json();
            document.getElementById('display_name').value = data.user_settings.display_name || '';
            document.getElementById('preferred_model').value = data.user_settings.preferred_model || 'standard';
            document.getElementById('job_title').value = data.user_settings.job_title || '';
            document.getElementById('education').value = data.user_settings.education || '';
            document.getElementById('interests').value = data.user_settings.interests || '';
            document.getElementById('additional_info').value = data.user_settings.additional_info || '';
            document.getElementById('conversation_style').value = data.user_settings.conversation_style || 'default';

            const modelSelect = document.getElementById('preferred_model');
            modelSelect.innerHTML = '';
            data.available_models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.alias;
                option.textContent = `${model.alias} - ${model.description}`;
                modelSelect.appendChild(option);
            });

            const styleSelect = document.getElementById('conversation_style');
            styleSelect.innerHTML = '';
            data.conversation_styles.forEach(style => {
                const option = document.createElement('option');
                option.value = style;
                option.textContent = style.charAt(0).toUpperCase() + style.slice(1);
                styleSelect.appendChild(option);
            });

            uiElements.settingsModal.classList.remove('hidden');
            toggleSidebar(false);
        } catch (err) {
            console.error('Error fetching settings:', err.message);
            if (uiElements.messageLimitWarning) {
                uiElements.messageLimitWarning.classList.remove('hidden');
                uiElements.messageLimitWarning.textContent = 'Failed to load settings. Please try again.';
            }
        }
    });
}
if (uiElements.cancelSettingsBtn) {
    uiElements.cancelSettingsBtn.addEventListener('click', () => {
        uiElements.settingsModal.classList.add('hidden');
    });
}

if (uiElements.closeSettingsBtn) {
    uiElements.closeSettingsBtn.addEventListener('click', () => {
        uiElements.settingsModal.classList.add('hidden');
    });
}

if (uiElements.settingsForm) {
    uiElements.settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!(await checkAuth())) {
            if (uiElements.messageLimitWarning) {
                uiElements.messageLimitWarning.classList.remove('hidden');
                uiElements.messageLimitWarning.textContent = 'Please log in to save settings.';
            }
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
            return;
        }
        const formData = new FormData(uiElements.settingsForm);
        const data = Object.fromEntries(formData);
        try {
            const { value: token } = await Preferences.get({ key: 'token' });
            const response = await fetch(`${baseUrl}/users/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                if (response.status === 401) {
                    await Preferences.remove({ key: 'token' });
                    window.location.href = '/login';
                }
                throw new Error('Failed to update settings');
            }
            if (uiElements.messageLimitWarning) {
                uiElements.messageLimitWarning.classList.remove('hidden');
                uiElements.messageLimitWarning.textContent = 'Settings updated successfully!';
                setTimeout(() => {
                    uiElements.messageLimitWarning.classList.add('hidden');
                }, 2000);
            }
            uiElements.settingsModal.classList.add('hidden');
            toggleSidebar(false);
        } catch (err) {
            console.error('Error updating settings:', err.message);
            if (uiElements.messageLimitWarning) {
                uiElements.messageLimitWarning.classList.remove('hidden');
                uiElements.messageLimitWarning.textContent = 'Error updating settings: ' + err.message;
            }
        }
    });
}
// History Toggle
if (uiElements.historyToggle) {
    uiElements.historyToggle.addEventListener('click', () => {
        if (uiElements.conversationList) {
            uiElements.conversationList.classList.toggle('hidden');
            uiElements.historyToggle.innerHTML = uiElements.conversationList.classList.contains('hidden')
                ? `<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
           </svg>Show History`
                : `<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
           </svg>Hide History`;
        }
    });
}

// Event listeners
uiElements.promptItems.forEach(p => {
    p.addEventListener('click', e => {
        e.preventDefault();
        if (uiElements.input) {
            uiElements.input.value = p.dataset.prompt;
            autoResizeTextarea();
        }
        if (uiElements.sendBtn) uiElements.sendBtn.disabled = false;
        submitMessage();
    });
});

if (uiElements.fileBtn) uiElements.fileBtn.addEventListener('click', () => uiElements.fileInput?.click());
if (uiElements.audioBtn) uiElements.audioBtn.addEventListener('click', () => uiElements.audioInput?.click());
if (uiElements.fileInput) uiElements.fileInput.addEventListener('change', previewFile);
if (uiElements.audioInput) uiElements.audioInput.addEventListener('change', previewFile);

if (uiElements.sendBtn) {
    console.log('sendBtn found:', uiElements.sendBtn);
    let pressTimer;
    const handleSendAction = (e) => {
        e.preventDefault();
        console.log('sendBtn clicked or touched:', e.type, e);
        if (uiElements.sendBtn.disabled || isRequestActive || isRecording) {
            console.log('sendBtn action blocked:', { disabled: uiElements.sendBtn.disabled, isRequestActive, isRecording });
            return;
        }
        if (uiElements.input.value.trim() || uiElements.fileInput.files.length > 0 || uiElements.audioInput.files.length > 0) {
            console.log('Submitting message');
            submitMessage();
        } else {
            console.log('Starting press timer for voice recording');
            pressTimer = setTimeout(() => startVoiceRecording(), 500);
        }
    };

    const handlePressEnd = (e) => {
        e.preventDefault();
        console.log('sendBtn press ended:', e.type);
        clearTimeout(pressTimer);
        if (isRecording) stopVoiceRecording();
    };

    uiElements.sendBtn.replaceWith(uiElements.sendBtn.cloneNode(true));
    uiElements.sendBtn = document.getElementById('sendBtn');

    uiElements.sendBtn.addEventListener('click', handleSendAction);
    uiElements.sendBtn.addEventListener('touchstart', handleSendAction);
    uiElements.sendBtn.addEventListener('touchend', handlePressEnd);
    uiElements.sendBtn.addEventListener('touchcancel', handlePressEnd);
} else {
    console.error('sendBtn not found in DOM');
}

if (uiElements.form) {
    uiElements.form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!isRecording && uiElements.input.value.trim()) {
            submitMessage();
        } else if (!isRecording && (uiElements.fileInput.files.length > 0 || uiElements.audioInput.files.length > 0)) {
            submitMessage();
        }
    });
}

if (uiElements.input) {
    uiElements.input.addEventListener('input', () => {
        updateSendButtonState();
        autoResizeTextarea();
    });
    uiElements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isRecording && !uiElements.sendBtn.disabled) submitMessage();
        }
    });
}

if (uiElements.stopBtn) {
    uiElements.stopBtn.addEventListener('click', () => {
        uiElements.stopBtn.style.pointerEvents = 'none';
        stopStream();
    });
}

if (uiElements.clearBtn) uiElements.clearBtn.addEventListener('click', clearAllMessages);

if (uiElements.conversationTitle) {
    uiElements.conversationTitle.addEventListener('click', () => {
        if (!(checkAuth())) return alert('Please log in to edit the conversation title.');
        const newTitle = prompt('Enter new conversation title:', currentConversationTitle || '');
        if (newTitle && currentConversationId) {
            updateConversationTitle(currentConversationId, newTitle);
        }
    });
}

if (uiElements.sidebarToggle) {
    uiElements.sidebarToggle.addEventListener('click', () => toggleSidebar());
}

if (uiElements.newConversationBtn) {
    uiElements.newConversationBtn.addEventListener('click', async () => {
        if (!(await checkAuth())) {
            alert('Please log in to create a new conversation.');
            window.location.href = '/login';
            return;
        }
        await createNewConversation();
    });
}

// Debug localStorage
const originalRemoveItem = localStorage.removeItem;
localStorage.removeItem = function (key) {
    console.log('Removing from localStorage:', key);
    originalRemoveItem.apply(this, arguments);
};

// Offline mode detection
window.addEventListener('offline', () => {
    if (uiElements.messageLimitWarning) {
        uiElements.messageLimitWarning.classList.remove('hidden');
        uiElements.messageLimitWarning.textContent = 'You are offline. Using local model.';
    }
});

window.addEventListener('online', () => {
    if (uiElements.messageLimitWarning) {
        uiElements.messageLimitWarning.classList.add('hidden');
    }
     checkAndSyncOnOnline();
});

// Function to auto-resize textarea
function autoResizeTextarea() {
    if (uiElements.input) {
        uiElements.input.style.height = 'auto';
        uiElements.input.style.height = `${uiElements.input.scrollHeight}px`;
        updateSendButtonState();
    }
}

// Function to check if text contains Arabic characters عدّل دالة isArabicText لتكون detectLanguage (لدعم أكثر لغات):
//function isArabicText(text) {
 //   const arabicCharCount = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
   // const totalCharCount = text.replace(/\s/g, '').length;
   // return totalCharCount > 0 && arabicCharCount / totalCharCount > 0.5; 
// }


function detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'en'; // Fallback إذا كان النص فارغ أو غير صالح

    // تنظيف النص من الرموز الخاصة لتحسين الدقة
    const cleanText = text.toLowerCase().replace(/[^a-zA-Z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0400-\u04FF\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u1D00-\u1D7F\u0C80-\u0CFF\u4E00-\u9FFF]/g, '');

    // تحديد اللغة بناءً على الأحرف
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) return 'ar'; // العربية
    if (/[\u0400-\u04FF]/.test(text)) return 'ru'; // الروسية
    if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(text)) return 'el'; // اليونانية
    if (/[\u0590-\u05FF]/.test(text)) return 'he'; // العبرية
    if (/[\u1D00-\u1D7F]/.test(text)) return 'la'; // اللاتينية
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn'; // الكانادا
    if (/[\u4E00-\u9FFF]/.test(text)) {
        // تمييز الصينية (zh) والكانتونية (zh-yue)
        if (text.match(/\b(nihao|hello)\b/)) return 'zh'; // الصينية (مبسطة)
        if (text.match(/\b(neihou|hello)\b/)) return 'zh-yue'; // الكانتونية
        return 'zh'; // افتراضي للصينية
    }

    // اللغات الأوروبية (مع أحرف خاصة)
    if (/[\u00C0-\u017F]/.test(text)) {
        if (text.match(/ç|ã|õ/)) return 'pt'; // البرتغالية
        if (text.match(/ñ|¿|¡/)) return 'es'; // الإسبانية
        if (text.match(/é|è|ê|à|ù|ç/)) return 'fr'; // الفرنسية
        if (text.match(/ß|ä|ö|ü/)) return 'de'; // الألمانية
        if (text.match(/à|è|ì|ò|ù/)) return 'it'; // الإيطالية
        if (text.match(/á|é|í|ó|ú|ý/)) return 'cs'; // التشيكية
        if (text.match(/ą|ę|ł|ń|ś|ź|ż/)) return 'pl'; // البولندية
        if (text.match(/á|é|í|ó|ú|ő|ű/)) return 'hu'; // المجرية
        if (text.match(/ā|ē|ī|ū/)) return 'lv'; // اللاتفية
        if (text.match(/å|ä|ö/)) return 'sv'; // السويدية
        if (text.match(/ș|ț/)) return 'ro'; // الرومانية
        if (text.match(/á|é|í|ó|ú|č|ď|ľ|ň|š|ť|ž/)) return 'sk'; // السلوفاكية
        if (text.match(/ç|ğ|ı|ö|ş|ü/)) return 'tr'; // التركية
        if (text.match(/ç|·|l·l/)) return 'ca'; // الكتالونية
        if (text.match(/ij|oe|ui/)) return 'nl'; // الهولندية
        if (text.match(/ĉ|ĝ|ĥ|ĵ|ŝ|ŭ/)) return 'eo'; // الإسبرانتو
        if (text.match(/ä|ö/)) return 'fi'; // الفنلندية
    }

    // الإنجليزية ومتغيراتها (fallback)
    if (/[a-zA-Z]/.test(text)) {
        if (text.match(/\b(color|organize|realize)\b/)) return 'en-us'; // أمريكي
        if (text.match(/\b(colour|organise|realise)\b/)) return 'en-gb'; // بريطاني
        if (text.match(/\b(whisky|loch)\b/)) return 'en-sc'; // اسكتلندي
        return 'en'; // الإنجليزية العامة
    }

    // Fallback إلى الإنجليزية إذا لم يتم التعرف على اللغة
    return 'en';
}
