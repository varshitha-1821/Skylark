# Skylark Drones – monday.com Business Intelligence Agent

This project is a conversational AI agent that answers business questions
for founders and executives by reading live data from two monday.com
boards — **Work Orders** and **Deals**. It handles messy, real-world data
without breaking, asks a clarifying question when a request is unclear,
and shows answers alongside charts so numbers are easy to understand at
a glance.

---

## How It Works

The agent follows a simple flow every time someone asks a question:

1. The question is sent from the chat screen to the backend.
2. The backend gives the question to an AI model (via Groq), along with a
   set of "tools" it is allowed to use — for example, "get pipeline
   health" or "summarize deals by sector."
3. The AI decides which tool(s) it needs, and those tools fetch fresh
   data directly from monday.com — nothing is stored or hardcoded, so
   the answer is always based on current data.
4. The raw data is cleaned (missing values are kept as clearly marked
   gaps, not guessed) and summarized using plain calculations, so all
   numbers are exact rather than estimated by the AI.
5. The AI turns the summarized data into a clear, founder-friendly
   answer, and the app displays it along with a chart if the numbers are
   suited to one.

A separate **Leadership Update** button works the same way, but skips the
AI step entirely — it runs the same calculations directly and shows a
fixed snapshot (pipeline value, at-risk deals, etc.), so it is instant
and always consistent no matter how it's triggered.

---

## Tech Stack and Why

| Layer | Choice | Reason |
|---|---|---|
| Frontend + Backend | Next.js (React + TypeScript) | One project handles both the chat screen and the backend logic, keeping the setup simple |
| Hosting | Vercel | Free, connects directly to GitHub, no server maintenance needed |
| Styling | Tailwind CSS | Fast to build a clean, custom look |
| Charts | Recharts | Simple bar/pie charts rendered directly in the chat |
| AI Model | Groq (`openai/gpt-oss-120b`) | Free to use and supports "tool calling," which lets the AI request real data instead of guessing |
| Data Source | monday.com GraphQL API | Reads both boards live, every time, as required by the assignment |

---

## What the Agent Can Do

- **Reads live data only** – every answer is pulled fresh from monday.com;
  nothing from the original spreadsheets is hardcoded.
- **Handles messy data gracefully** – rows with formatting errors are
  filtered out, and missing fields are never silently guessed. Instead,
  the agent tells the user when data is incomplete (for example, "52% of
  deals are missing a value").
- **Understands natural questions** – it maps everyday phrasing to the
  right data lookup, and asks one clarifying question if a request is
  genuinely unclear, rather than guessing incorrectly.
- **Connects both boards together** – it can match a Deal to its related
  Work Order to answer questions that span both datasets (with a note
  that this match is based on name, since there's no shared ID between
  boards).
- **Gives insights, not just numbers** – answers point out what's
  notable or worth attention, not just raw totals.
- **Shows charts automatically** – when an answer includes comparable
  numbers (like values across sectors), the app displays a chart next to
  the text.
- **One-click Leadership Update** – a button that instantly shows a
  snapshot of pipeline value and key risks, without needing to ask a
  question first.

---

## Setup Instructions

### 1. Set up monday.com
1. Create a free monday.com account and workspace.
2. Create two boards and import the provided data into them:
   - **Deals** board ← `Deal_funnel_Data`
   - **Work Order** board ← `Work_Order_Tracker`
3. Get an API token from **Avatar → Developers → My Access Tokens**.
4. Get each board's ID from its URL: `https://<your-team>.monday.com/boards/<BOARD_ID>`

### 2. Add your keys
Create a file named `.env.local` in the project folder with:
```
MONDAY_API_TOKEN=your_monday_token_here
GROQ_API_KEY=your_groq_key_here
WORK_ORDERS_BOARD_ID=your_work_orders_board_id
DEALS_BOARD_ID=your_deals_board_id
```

### 3. Run it locally
```bash
npm install
npm run dev
```
Then open `http://localhost:3000` in a browser.

### 4. Deploy it (what was used for the hosted link)
1. Push the code to GitHub.
2. Import the repository into Vercel (vercel.com → New Project).
3. Add the same 4 keys from step 2 under Vercel's Environment Variables.
4. Deploy.

---

## Known Limitations

- Matching a Deal to its Work Order is done by name, not a shared ID —
  so it is treated as an approximate match everywhere it's used.
- Charts only appear when an answer has two or more comparable numbers;
  single-number answers are shown as text only.
- The agent asks at most one clarifying question per topic before
  giving its best answer, so it doesn't get stuck looping on a vague
  question.

---

## Project Status

The full pipeline — monday.com integration, data cleaning, business
calculations, the AI agent, the chat interface with charts, and the
Leadership Update feature — is built and tested against live data.
