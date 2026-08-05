# CrowdFlow AI 🏟️
> **Submission for Prompt Wars - Challenge 1**

CrowdFlow AI is an agentic, Generative AI-powered crowd management system designed to eliminate congestion, optimize exit routes, and streamline venue operations at large-scale sporting and event arenas.

---

## 🏆 Prompt Wars Challenge 1 Focus

* **Challenge Context:** Prompt Wars - Challenge 1 Submission.
* **Core Innovation:** Beyond static mapping, CrowdFlow AI dynamically models crowd telemetry in real time. It automatically generates safe navigation re-routes and deploys intelligent fallback alerts to venue managers without human intervention.
* **Generative AI Integration:** Powered by Google's Gemini models via an autonomous AI Agent (`agent.js`) that analyzes live density metrics, sanitizes inputs (`sanitize.js`), and generates natural language operational directives for safety officers and attendees.

---

## 🎯 Problem Statement

Large stadiums and event venues consistently suffer from:
* Unmanaged entry and exit bottlenecking leading to safety risks.
* Unpredictable crowd density spikes across concourses.
* Lack of real-time operational guidance for attendees and venue staff.

---

## 💡 Solution & Features

* **Real-time Crowd Telemetry:** Simulates and measures live spatial occupancy levels (`crowdSimulator.js`).
* **Generative AI Agent:** Synthesizes complex crowd analytics into actionable natural-language instructions.
* **Automated Safety Sanity Checks:** Ensures prompt injections and malformed data are filtered before reaching the AI core.
* **Dynamic Interactive Dashboard:** Multi-page responsive Web UI showcasing live heatmaps, venue statuses, and AI assistant capabilities.

---

## 🛠️ Tech Stack & Architecture

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
* **Backend:** Node.js, Express.js
* **Generative AI / Agent:** Google Gemini API (`@google/genai`), Custom Agent Workflow
* **Real-time Communication:** WebSockets / Socket.io

---

## 📁 Project Structure

```text
crowdflow-ai/
├── index.html               # Multi-page Responsive UI Layout
├── script.js                # Frontend Client Controller
├── style.css                # Visual Styling & Dashboard Layouts
├── README.md                # Documentation & Submission Info
└── backend/                 # Secure Agentic Server Stack
    ├── server.js            # Express API Server
    ├── agent.js             # Gemini AI Agent Core
    ├── crowdSimulator.js    # Real-time Telemetry Simulator
    ├── sanitize.js          # Input Guardrails & Prompt Protection
    ├── .env.example         # Environment Variable Template
    └── package.json         # Server Dependencies
