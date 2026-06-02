# 🛡️ RedFlag – Scam & Phishing Detection Extension

## 📖 About the Project
RedFlag is a cybersecurity browser extension that helps users detect suspicious, scam, and phishing websites while browsing. The extension analyzes the current website and gives the user a risk score, website status, reasons, and an AI explanation.
The project uses a hybrid detection system. It combines rule-based checks with AI analysis using Ollama. The rule-based system checks things like the URL, HTTPS, suspicious keywords, domain structure, forms, and phishing indicators. Ollama helps explain the result in simple language so the user can better understand why a website may be safe, suspicious, or dangerous.

## 🎯 Project Goal

The goal of this group project is to create a browser extension that helps users recognize scam and phishing websites. Many users do not know how to identify online threats, so RedFlag gives them a clear warning, explanation, and risk score before they interact with a suspicious website.


## ✨ Main Features

- Detects phishing and scam websites
- Shows a risk score from 0 to 100
- Uses three risk levels:
  - 0-20 = Safe
  - 21-50 = Suspicious
  - 51-100 = Dangerous
- Uses rule-based website checks
- Uses Ollama AI for content analysis
- Shows clear human-readable explanations
- Highlights suspicious text on the webpage
- Shows suspicious buttons count
- Saves scan history in the extension activity tab
- Allows users to report a website locally
- Supports light and dark mode

## 🛠 Technologies Used

- HTML
- CSS
- JavaScript
- Chrome Extension Manifest V3
- Node.js
- Express.js
- Ollama
- Firebase Firestore
- Google Safe Browsing API
- Chrome Storage API

## 📂 Project Structure

```text
group-project/
├── background.js
├── content.js
├── firebase.js
├── manifest.json
├── popup.html
├── popup.js
├── server.js
├── styles.css
├── package.json
├── package-lock.json
├── README.md
└── icons/
````
## 🔥 Firebase Setup

Firebase is used for:

* Community reporting
* Scan history

Note: Create a Firebase project and configure Firestore before running the extension.

## 🏗️ System Architecture

RedFlag consists of four main components:

1. Chrome Extension Frontend
   - Popup interface
   - Activity history
   - User reporting

2. Rule-Based Detection Engine
   - URL analysis
   - Domain analysis
   - Keyword detection

3. Ollama AI Analysis
   - Website content analysis
   - Human-readable explanations

4. Firebase Firestore
   - Community reports
   - Scan history

## How It Works

When the user opens the extension, RedFlag scans the current website. The popup collects website data such as page text, links, buttons, forms, image text, and URL information. This data is sent to the local backend server.
The backend checks the website using rule-based logic and Ollama AI. It then returns a score, status, reasons, suspicious phrases, and an explanation. The popup displays the result to the user in a simple interface.

## Risk Score Meaning

```text
0-20    Safe
21-50   Suspicious
51-100  Dangerous
```

## Setup Instructions

### 1. Install Node.js

Download and install Node.js from:

[https://nodejs.org/](https://nodejs.org/)

After installing, check if Node.js works:

```bash
node -v
npm -v
```

### 2. Install Ollama

Download and install Ollama from:

[https://ollama.com/](https://ollama.com/)

After installing, start Ollama:

```bash
ollama serve
```

In another terminal, download the model:

```bash
ollama pull llama3.2:1b
```

### 3. Install Project Dependencies

Open the project folder in the terminal:

```bash
cd group-project
```

Install dependencies:

```bash
npm install
```

### 4. Add Environment Variables

Create a `.env` file in the root of the project.

Add your Google Safe Browsing API key:

```env
GOOGLE_SAFE_BROWSING_KEY=your_api_key_here
```

Note: If you do not have an API key, the project can still run, but Google Safe Browsing may not work correctly.

### 5. Start the Backend Server

Run:

```bash
npm start
```

You should see:

```text
RedFlag backend running on http://localhost:3000
```

### 6. Load the Extension in Chrome

Open Chrome and go to:

```text
chrome://extensions
```

Then:

1. Turn on Developer Mode
2. Click "Load unpacked"
3. Select the project folder
4. Pin the RedFlag extension
5. Open any website
6. Click the RedFlag icon to scan the website

## Important Notes

- The backend server must be running for the extension to analyze websites.
- Ollama must also be running for AI analysis to work.
- If the backend is not running, the extension may show that the backend server is unavailable.

## 🧪 Testing

### Test Safe Websites

- https://google.com
- https://github.com
- https://microsoft.com

Expected Result:
- Status: Safe
- Risk Score: 0-20

### Test Suspicious Websites

Use websites containing:
- Urgency messages
- Fake login forms
- Suspicious payment requests

Expected Result:
- Status: Suspicious or Dangerous
- Risk Score: Above 20

### Test Community Reporting

1. Open a website
2. Click Report Website
3. Verify report count increases

### Test Activity History

1. Scan multiple websites
2. Open Activity tab
3. Verify scan history is stored

## 👥 Team

Group Project – HBO-ICT Cyber Security

Team Members:

* Enas Hazbar
* Daniela Hodaka
* Bushra Obeido
* Daniella Namuli 
* Marija Boiko
* Jasmina Krus

## 📸 Screenshots

Add screenshots here:

* Extension Popup
* Website Analysis
* Activity History
* Dark Mode

## Disclaimer

RedFlag is a school project and is not a professional security product. The extension can help detect suspicious websites, but it may not always be correct. Users should still be careful and verify websites manually when entering personal or financial information.
