# CrowdFlow AI 🏟️
> **Submission for Prompt Wars - Challenge 1**

CrowdFlow AI is an Agentic Generative AI-powered crowd management system. Built specifically for **Prompt Wars Challenge 1**, it leverages system prompting, structured agent workflows, and real-time telemetry to prevent stadium congestion and optimize emergency routes.

---

## 🏆 Prompt Wars Challenge 1 Focus

* **Core Innovation:** Instead of simple static routing, CrowdFlow AI uses an **Autonomous AI Agent Core** (`agent.js`) that analyzes live crowd density spikes, sanitizes user inputs, and dynamically resolves bottlenecking in real time.
* **Agentic Architecture & GenAI:** Driven by Google's Gemini API via customized system prompts and automated guardrails (`sanitize.js`) to provide natural language operational guidance to venue operators.

---

## 🎯 Problem Statement

Large stadiums often face:
* Sudden concourse overcrowding and exit bottlenecks.
* Slow manual response times during emergency or high-density situations.
* Lack of an intelligent assistant to handle live attendee queries.

---

## 💡 Solution & Key Capabilities

* **Agentic Decision Engine:** Evaluates live crowd signals (`crowdSimulator.js`) and outputs structured safety recommendations.
* **Prompt Protection & Sanitization:** Filters injections and malformed inputs before reaching the GenAI core.
* **Interactive Multi-Page UI:** Clean dashboard displaying live spatial heatmaps and AI Assistant interfaces.

---

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3, JavaScript (ES6+)
* **Backend:** Node.js, Express.js
* **GenAI / Agent Engine:** Google Gemini API (`@google/genai`), Agent Workflows
* **Communication:** WebSockets / Socket.io

---

## 📁 Project Structure

```text
crowdflow-ai/
├── index.html               # Multi-Page Responsive Frontend UI
├── script.js                # Frontend Controller & Socket Handler
├── style.css                # Visual Styling & Dashboard Layout
├── README.md                # Submission Documentation
└── backend/                 # Agentic Backend Stack
    ├── server.js            # Express API Server
    ├── agent.js             # Gemini AI Agent Core
    ├── crowdSimulator.js    # Real-time Telemetry Simulator
    ├── sanitize.js          # Input Guardrails & Prompt Security
    ├── .env.example         # Environment Setup Template
    └── package.json         # Server Dependencies
