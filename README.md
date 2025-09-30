# MGZon AI Assistant

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![ONNX Runtime](https://img.shields.io/badge/ONNX-Runtime-orange.svg)](https://onnxruntime.ai/)

## Overview

MGZon AI Assistant is a versatile, offline-capable chat application built with JavaScript, designed for seamless interactions with an AI-powered assistant. It supports text, voice, and image inputs, enabling users to chat, transcribe audio, and analyze images. The app operates in both online and offline modes: online mode connects to a backend server for advanced processing, while offline mode leverages local ONNX models (Qwen2-0.5B for text generation and Whisper-tiny for audio transcription) to ensure functionality without internet access.

This project is ideal for developers building hybrid mobile/web AI chatbots, with support for Capacitor (for Android/iOS integration), Markdown rendering, code highlighting, and a responsive UI. It prioritizes user privacy by storing conversations locally in offline mode and syncing them upon login.

## Features

- **Multi-Modal Input**: Handle text messages, voice recordings (via Capacitor plugins), audio files, and image uploads.
- **Offline Support**: Use local AI models for text generation and audio transcription when offline. Models are preloaded and cached for efficiency.
- **Online Integration**: Connect to a backend API (hosted on Hugging Face Spaces) for advanced features like streaming responses, conversation history syncing, and server-side processing.
- **Conversation Management**: Save, load, edit, and delete conversations. Supports guest mode (sessionStorage) and authenticated mode (server-side storage).
- **UI Enhancements**:
  - Responsive design with sidebar for conversation history.
  - Markdown rendering with RTL support for Arabic text.
  - Code syntax highlighting using Prism.js.
  - Animations via AOS and touch gestures with Hammer.js.
- **Authentication**: Token-based login/logout with session verification.
- **Error Handling**: Graceful handling of network issues, model loading failures, and API errors with user-friendly warnings.
- **Customization**: Settings modal for user preferences like preferred AI model and conversation style (requires authentication).
- **Voice Recording**: Integrated voice input with permission checks and base64 audio processing.

## Technologies Used

- **Core**: JavaScript (ES6+), HTML5, CSS3.
- **Frameworks/Libraries**:
  - Capacitor: For native mobile features (voice recording, preferences storage).
  - ONNX Runtime: For running local AI models in the browser.
  - Marked.js: Markdown parsing.
  - Prism.js: Code syntax highlighting.
  - AOS: Animate on Scroll for UI transitions.
  - Hammer.js: Touch gesture support.
- **AI Models**:
  - Text: Qwen2-0.5B-Instruct (ONNX format).
  - Audio: Whisper-tiny (ONNX format for encoder/decoder).
- **Backend**: Hugging Face Spaces API for online processing.
- **Storage**: SessionStorage for offline/guest mode; Server-side for authenticated users.
- **Other**: Crypto API for session IDs, Fetch API for network requests.

## Installation

### Prerequisites
- Node.js (v14+ recommended).
- Android/iOS development setup if building for mobile (via Capacitor).
- Browser with WebAssembly support (for ONNX models).

### Steps
1. Clone the repository:
   ```
   git clone https://github.com/yourusername/mgz-on-ai-assistant.git
   cd mgz-on-ai-assistant
   ```

2. Install dependencies (if any Node modules are used, e.g., for build tools):
   ```
   npm install
   ```

3. Place AI models in the appropriate directories:
   - `/models/qwen2-0.5b-onnx/model.onnx`
   - `/models/whisper-tiny-onnx/encoder_model.onnx`
   - `/models/whisper-tiny-onnx/decoder_model.onnx`
   (Download from ONNX Model Zoo or convert via Hugging Face.)

4. For mobile (Capacitor):
   - Add platforms:
     ```
     npx cap add android
     npx cap add ios
     ```
   - Sync and build:
     ```
     npx cap sync
     npx cap open android  # or ios
     ```

5. Serve locally (for web):
   - Use a local server like `live-server` or open `index.html` in a browser.
   - Ensure models are served from the correct paths.

## Usage

1. **Running the App**:
   - Open in a browser or run on mobile via Capacitor.
   - If offline, the app will preload local models and display a warning.
   - Log in for persistent conversation history.

2. **Interacting**:
   - Type a message and send.
   - Upload images/audio or record voice.
   - Use the sidebar to manage conversations (authenticated users only).
   - Edit settings via the gear icon.

3. **Offline Mode**:
   - Automatically detected; uses local models.
   - Conversations stored in sessionStorage.

4. **Online Mode**:
   - Connects to `https://mgzon-mgzon-app.hf.space` for API calls.
   - Syncs history upon login.

Example: Send "Hello, how are you?" – The assistant responds using either server or local model based on connectivity.

## Configuration

- **Base URL**: Change `baseUrl` in `chat.js` for custom backend.
- **Models**: Ensure model paths are correct; preload via `preloadModels()`.
- **UI Customizations**: Modify UI elements in HTML/CSS; RTL support is auto-detected.

## Contributing

We welcome contributions! Follow these steps:
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/new-feature`.
3. Commit changes: `git commit -m 'Add new feature'`.
4. Push to branch: `git push origin feature/new-feature`.
5. Open a Pull Request.

Please adhere to code style (ESLint recommended) and include tests if applicable.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.



For questions, open an issue or contact [hadad@linuxmail.org](mailto:hadad@linuxmail.org).
