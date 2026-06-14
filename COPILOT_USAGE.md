# 🤖 GitHub Copilot Usage Document

This document describes how **GitHub Copilot** and **VS Code** were leveraged to build **Form Mitra**, demonstrating acceleration, problem-solving, and creative iteration.

---

## ⚡ 1. Accelerating Code Writing (Suggestions & Autocomplete)

GitHub Copilot was extensively used to write boilerplate code and accelerate styling:
* **Tailwind UI/UX Design**: Copilot suggestions helped implement a modern, sleek, and highly responsive extension interface. By typing a comment like `// Render message list with glassmorphism style`, Copilot autocompleted the React markup with rich, tailored colors (e.g. `bg-emerald-500/10`, `border-white/10`, custom slide-in animations).
* **SQLite Database Migrations**: Copilot helped generate the schema and the migration try-except blocks in `backend/app/db.py` to seamlessly add columns (`citation_map`, `annotations`, `extracted_text`) to existing sqlite tables without losing session history.
* **TypeScript Types & Interfaces**: Autocompleted complex TypeScript type interfaces for chat messages, progress tracking events, and extension messages.

---

## 🧠 2. Problem-Solving & Debugging (Copilot Chat)

For complex and algorithmic parts of the project, Copilot Chat served as a pair-programmer:

### A. Windows DXGI GPU Auto-detection via ctypes
To run Phi-4-ONNX locally, we need to pass the correct device ID to ONNX Runtime GenAI's DirectML execution provider. Writing raw C-bindings via ctypes in Python is notoriously error-prone. 
* **The Problem**: We needed to enumerate physical graphics adapters on Windows, retrieve their Dedicated Video Memory, discard basic software rendering drivers, and return the best index.
* **Copilot Chat Solution**: Copilot Chat wrote the entire DXGI helper structures (`LUID`, `DXGI_ADAPTER_DESC`, `GUID`) and resolved the vtable offsets for `EnumAdapters` and `Release` dynamically.
* **Prompt**:
  > "Help me write ctypes structures for DXGI_ADAPTER_DESC and GUID in Python. I want to enumerate Windows GPU devices, get their VRAM, filter out Vendor ID 0x1414, and sort them to find the best dGPU or iGPU."

### B. Multi-Viewport Screenshot Stitching
Chrome extensions have strict limits on screenshot memory and rate-limiting when capturing active tab viewports.
* **The Problem**: Scrolling long forms and stitching them into a single image requires canvas manipulation and cropping.
* **Copilot Chat Solution**: Copilot Chat suggested the workflow implemented in `background.js` and `screenshot.ts`: scrolling page-by-page, capturing the viewport with retry delays to bypass Chrome API rate limits, and stitching the parts together using an offscreen canvas.

### C. PDF Compression via Low-DPI Re-rendering
The Remote Agent requires files under specific size limits (e.g., 1MB).
* **The Problem**: Users might upload high-resolution scans.
* **Copilot Chat Solution**: Copilot Chat suggested an aggressive compression technique using PyMuPDF: load each page, render it to a `pixmap` at 110 DPI, save it as a JPEG in-memory with `quality=50`, and then rebuild the PDF. This reduced multi-megabyte PDFs by up to 90% while keeping text OCR-readable.

---

## 🛠️ 3. Prompting Techniques & Templates

Two key prompting techniques were used during the development:

### 1. "Role-Play & Contextual Grounding"
When writing the local orchestrator logic, we grounded the LLM by explicitly telling it:
```markdown
System Prompt:
"You are Form Mitra's local agent planning assistant.
Analyze the required format and size constraints for each document from the remote agent's response, and check them against the uploaded files list..."
```
This roleplay combined with concrete execution rules ensured that the local LLM outputted *strictly valid JSON list action objects* without adding conversational text.

### 2. "Few-Shot Chain of Thought"
For the local age extraction, we used a few-shot instruction:
```markdown
Today's Date: 14 June 2026 (day 14, month 06, year 2026), Sunday, 01:30
Input Remote Agent Response:
"Please provide: 1. Name 2. Date of Birth 3. Age..."
Input OCR Texts:
File: aadhar_synthetic.pdf -> "NAME: JOHN SMITH, DOB: 15/08/1995"
Reasoning: DOB is 15 August 1995. Today is 14 June 2026. From 1995 to 2026 = 31 years. But birthday has not yet occurred... So age = 30.
Expected Output:
1. Name: John Smith
2. Date of Birth: 15/08/1995
3. Age: 30
```
This enabled the model to correctly calculate dates and handle edge cases, resulting in flawless accuracy during extraction checks.
