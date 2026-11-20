# Habits — Offline-First Habit & Task Tracker

A refined, local-first habit and task tracker built as a standalone modern web application with instant IndexedDB persistence, a compact binary snapshot codec, rich streak and weekly analytics, and optional Google Drive synchronization via OAuth 2.0.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Scope & Design Decisions**:
> - **Dual Mode (Guest + Google Drive Sync)**: Local-first operation in IndexedDB for all users, paired with Google Drive OAuth 2.0 binary snapshot synchronization for authenticated Google users.
> - **Aesthetic & Language**: English interface styled in a smooth, Apple-inspired minimalist dark theme with crisp spatial hierarchy, hairline borders, and subtle elevation.
> - **Remembered Entry Flow**: Dedicated welcome choice screen (*Sign in with Google* vs. *Continue as Guest*) whose choice is remembered across sessions, with a quick account/mode switch inside the app.
> - **Google Drive OAuth Setup**: Upon plan approval, the interactive OAuth setup card will appear first to authorize the `drive.appdata` scope (storing the packed snapshot inside the app's private Google Drive App Data folder without cluttering your visible Drive).

---

## 1. Overview & Core Concept

- **What It Does**: Lets users build daily routines and manage tasks seamlessly offline. Users check off scheduled habits on a focused *Today* board, manage recurring weekday schedules and task due dates, browse/edit past dates in an interactive *History* calendar, and inspect real-time streaks, completion rates, activity heatmaps, and weekly completed task charts. For cross-device continuity, Google users can synchronize a single compact binary snapshot to Google Drive with timestamp-based conflict resolution.
- **Target Audience**: Individuals seeking a calm, high-speed, privacy-respecting daily cockpit that works instantaneously with zero server latency while offering effortless cloud backup and multi-device merge when desired.
- **Key Value**: Sub-millisecond local interactions (all reads/writes hit IndexedDB directly), compact binary snapshots (bitpacked check-ins + deduplicated string/ID tables) instead of bloated JSON dumps, and safe non-destructive merging across devices.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Remembered Entry Screen (Zero-State & Returning Sessions)**
   - On first visit, users see a calm, centered entry canvas offering two clear choices: **Sign in with Google** (official Google button style, unlocks Drive snapshot sync) and **Continue as Guest** (100% local IndexedDB, zero network calls).
   - Selecting a mode persists the session preference locally. Returning Guest users land directly in the tracker; returning Google users land in the tracker with their local IndexedDB data immediately ready and a quiet, one-click *Connect / Sync Drive* action if their in-memory OAuth token expired on reload.
   - Users can switch modes or sign out anytime from the workspace account menu.

2. **Today Workspace (Primary Focus)**
   - **Header & Navigation**: Clean single-row top bar with brand wordmark (*Habits*), 4 concise navigation tabs (*Today*, *Habits*, *Tasks*, *History*), and a single primary action trigger (*Sync Drive* for Google mode or *New Entry* / mode indicator). On narrow/mobile screens, navigation adapts cleanly to a compact bottom thumb bar (staying well within the 15% sticky height cap).
   - **Scheduled Habits**: Displays only active (non-archived) habits scheduled for today's local civil weekday, with one-tap binary completion toggle, current streak figure, habit color indicator, and inline expandable daily note editor.
   - **Tasks Due & Overdue**: Displays incomplete tasks due today or overdue (visually flagged with clear text + amber/crimson semantic cues, never color alone), alongside quick completion checkboxes and inline task creation.

3. **Habits & Tasks Management**
   - **Habits View**: Create, rename, pick from curated muted Apple-inspired accent swatches, toggle 7-day weekday schedules (Mon–Sun bitmask), and archive/unarchive habits. Archiving hides a habit from *Today* while preserving all historical check-ins and notes for accurate analytics.
   - **Tasks View**: Create and edit tasks with title, optional note, and optional civil due date (`dueDay` or unscheduled), toggle completion, and filter between *Active*, *Scheduled*, and *Completed*.

4. **History & Analytics**
   - **Interactive Month Calendar**: Navigate months by local civil `dayIndex`. Clicking any past or current day opens that day's detail drawer/panel to toggle check-ins or edit day notes using the exact same IndexedDB write path as *Today*.
   - **Computed Metrics (Zero Stored Telemetry)**:
     - Current streak and longest streak per habit (days outside the habit's scheduled weekdays never break a streak).
     - Completion rate over selectable timeframes (30 days, 90 days, all time).
     - Multi-month activity heatmap grid rendered cleanly with accessible tooltips.
     - Weekly completed tasks bar chart computed directly from local task records.
     - Empty states display clean guidance with a direct call to action rather than fabricated sample points.

5. **Google Drive Snapshot Sync (Google Mode Only)**
   - Triggering a sync downloads any existing remote snapshot first, unpacks and validates it in memory, merges records with local IndexedDB by `updatedAt` (newest timestamp wins per habit, `(habitId, dayIndex)` check-in/note, and task without overwriting untouched days), and asks for explicit user confirmation before uploading/overwriting the remote snapshot when local changes differ.
   - Identical byte payloads skip upload automatically; rapid local edits coalesce cleanly. Network errors or malformed remote bytes leave local IndexedDB completely untouched and surface a non-blocking recovery banner.

### Visual Identity & Theme

- **Aesthetic Direction**: Smooth, Apple-inspired dark minimalism—whisper-quiet obsidian surfaces, subtle layered translucency on modals/sheets, refined hairline borders (`1px solid rgba(255, 255, 255, 0.08)`), generous breathing room, and disciplined single-elevation cards (no nested cards-within-cards).
- **Color Palette (60-30-10 Discipline)**:
  - *60% Dominant Neutral Canvas*: Deep obsidian slate (`#0A0B0E` background).
  - *30% Structural Surfaces*: Elevated charcoal cards (`#14161B`), hover surfaces (`#1C1F26`), crisp primary text (`#F5F7FA` with slight dark-mode optical tracking compensation), and muted secondary metadata (`#8E95A5`).
  - *10% Accent Budget*: Refined electric cobalt (`#3B82F6` / `#60A5FA`) reserved strictly for primary actions and active navigation states, paired with semantic green (`#22C55E`) for completed check-ins, amber (`#F59E0B`) for due-soon warnings, and crimson (`#EF4444`) for overdue tasks/errors—always paired with explicit text or icons.
- **Typography & Tabular Precision**:
  - *Display & Headings*: `Plus Jakarta Sans` (SemiBold 600, `text-wrap: balance`).
  - *Body & Controls*: `DM Sans` (Regular 400 / Medium 500, crisp legibility on dark surfaces).
  - *Metrics, Streaks & Dates*: `JetBrains Mono` with `tabular-nums` so counters, percentages, and calendar columns align cleanly without jitter.
- **Motion & Tactile Feedback**: Snappy `150ms`–`200ms` transitions (`cubic-bezier(0.16, 1, 0.3, 1)`) using compositor-only properties (`transform`, `opacity`), respecting `prefers-reduced-motion`. All interactive targets maintain `>= 44px` hitboxes on touch viewports.

---

## 3. Key Product Decisions & Trade-Offs

- **Standalone React + Vite Architecture (Replacing GAS & SolidJS)**:
  - *Chosen Approach*: Implement the modular TypeScript domain, IndexedDB store, binary codec, and Google Drive OAuth sync inside the configured React + Vite + Tailwind CSS workspace, retaining the clean OOP separation between domain/storage/sync classes and functional UI components.
  - *Why*: Eliminates Google Apps Script server proxies (`doGet`, `HtmlOutput`, `PropertiesService`) and avoids unnecessary toolchain churn while keeping the browser runtime lightweight, fast, and directly compatible with client-side Google OAuth 2.0.
- **Least-Privilege Drive Scope (`drive.appdata`)**:
  - *Chosen Approach*: Request only `https://www.googleapis.com/auth/drive.appdata` via Firebase Auth + Google OAuth 2.0, storing a single binary snapshot file (`habits-snapshot.bin`) in the user's hidden App Data folder.
  - *Why*: Protects user privacy by never accessing personal Drive files or folders, prevents accidental manual edits to the binary snapshot in Google Drive, and follows strict least-privilege security.
- **In-Memory OAuth Token Caching + Remembered Mode Preference**:
  - *Chosen Approach*: Persist only the selected mode (`guest` or `google`) in `localStorage`, while keeping the Google OAuth access token strictly in memory.
  - *Why*: Meets the remembered sign-in choice requirement without violating security rules against storing OAuth access tokens or sensitive user credentials in `localStorage`.
- **Binary Snapshot Format Over JSON**:
  - *Chosen Approach*: Pack habits, bitmask check-ins (indexed from `startDay`), string/ID deduplication tables, notes, and tasks into a compact versioned binary `Uint8Array` with integrity validation.
  - *Why*: Keeps Drive payloads tiny and fast, cleanly separates persisted domain records from derived analytics, and guarantees atomic validation before touching local IndexedDB.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                          React UI Presentation Layer                      │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │ Entry Choice │  │  Today   │  │  Habits  │  │  Tasks   │  │ History │  │
│  │ Google/Guest │  │  Board   │  │ Manager  │  │ Manager  │  │ & Stats │  │
│  └──────┬───────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘  │
└─────────┼───────────────┼─────────────┼─────────────┼─────────────┼───────┘
          │               │             │             │             │
          ▼               ▼             ▼             ▼             ▼
┌───────────────────┐  ┌────────────────────────────────────────────────────┐
│  SessionManager   │  │            Domain & Analytics Services             │
│  - mode (guest |  │  │  - CivilCalendar (local dayIndex, weekday bits)    │
│    google)        │  │  - StreakCalculator (streaks, completion rate)     │
│  - Firebase Auth  │  │  - TodayBoard (scheduled habits, due/overdue)      │
│  - in-mem token   │  │  - TaskAnalytics (weekly completion buckets)       │
└─────────┬─────────┘  └────────────────────────┬───────────────────────────┘
          │                                     │
          │                                     ▼
          │            ┌────────────────────────────────────────────────────┐
          │            │             HabitDatabase (IndexedDB)              │
          │            │  - habits (autoId >= 1)                            │
          │            │  - checkins (habitId + dayIndex, indexed)          │
          │            │  - notes (habitId + dayIndex, indexed)             │
          │            │  - tasks (autoId >= 1)                             │
          │            └────────────────────────┬───────────────────────────┘
          │                                     │
          │            (Google Mode Only)       ▼
          │            ┌────────────────────────────────────────────────────┐
          └───────────►│           DriveSyncService & SnapshotCodec         │
                       │  - SnapshotCodec (pack / unpack Uint8Array)        │
                       │  - StringTable / IdTable / SnapshotReader & Bytes  │
                       │  - SnapshotMerger (timestamp-wins per record)      │
                       │  - Drive REST API (drive.appdata + retry/confirm)  │
                       └────────────────────────────────────────────────────┘
```

### Data Model & State

- **Civil Time (`CivilCalendar`)**: Every date is represented as an integer `dayIndex` (civil days since `1970-01-01` computed from the device's local year, month, and day—never UTC epoch division), ensuring midnight boundaries never shift across timezones. Weekday schedules use a 7-bit mask (`bit 0 = Monday` through `bit 6 = Sunday`).
- **Domain Entities (IndexedDB Stores)**:
  - **Habit**: `id` (integer `>= 1`), `name`, `color`, `weekdays` (7-bit mask), `startDay`, `archivedAt` (`number | null`), `createdAt`, `updatedAt`.
  - **Check-in**: `habitId`, `dayIndex`, `done` (`boolean`), `updatedAt` (compound key `[habitId, dayIndex]` with indexes on `habitId` and `dayIndex`).
  - **Day Note**: `habitId`, `dayIndex`, `text`, `updatedAt` (compound key `[habitId, dayIndex]` with indexes on `habitId` and `dayIndex`).
  - **Task**: `id` (integer `>= 1`), `title`, `note`, `dueDay` (`number | null`), `done` (`boolean`), `createdAt`, `updatedAt`.
- **Derived State (Computed in Memory Only)**: Current streak, longest streak, period completion percentage, daily heatmap intensity matrix, and weekly completed task counts are always derived dynamically from IndexedDB records and never persisted to IndexedDB or binary snapshots.

### Interactive Component & State Mapping

- **Entry & Auth Flow**: Clicking *Continue as Guest* sets `SessionManager` mode to `guest` and mounts the tracker immediately. Clicking *Sign in with Google* triggers Firebase `signInWithPopup` with `drive.appdata`, caches the OAuth token in memory, sets mode to `google`, and loads local IndexedDB immediately. If a returning Google user reloads the page (in-memory token cleared), the tracker remains fully usable offline with a subtle *Reconnect Google Drive* action in the sync trigger.
- **Today Check-in & Note Flow**: Tapping a habit row dispatches an atomic `upsertCheckin(habitId, dayIndex, !done, Date.now())` write to `HabitDatabase`, updates reactive state immediately, and recomputes the habit's streak. Expanding a habit's note field saves debounced or explicit note updates via `upsertNote(...)`.
- **Habit & Task CRUD Flows**: Modals/drawers validate non-empty names/titles, ensure at least one weekday bit is selected for habits, persist immediately to `HabitDatabase`, and update all views (*Today*, *Habits*, *Tasks*, *History*) seamlessly.
- **History Day Inspection**: Selecting any calendar cell in *History* loads check-ins and notes for that `dayIndex` and permits toggling/editing historical check-ins identically to *Today*.
- **Sync & Confirmation Flow**: Clicking *Sync Drive* fetches the existing `habits-snapshot.bin` from `appDataFolder` (with exponential backoff retry), unpacks and merges remote records by `updatedAt` if present, computes the merged binary snapshot, skips upload if bytes match the remote payload, or opens a clear confirmation dialog summarizing what will be updated on Google Drive before performing the upload.

### Key Sequences & Integrations

- **Google Workspace OAuth 2.0 Setup**: Provisioned via AI Studio's OAuth tool (`drive.appdata` scope) using client-side Firebase Authentication (`GoogleAuthProvider`), with zero secrets stored in client code or `localStorage`.
- **Snapshot Binary Protocol**: Magic header + format version -> deduplicated `StringTable` -> `IdTable` -> serialized habits (metadata + bitpacked check-in mask relative to `startDay`) -> day notes -> tasks -> checksum/length verification. Any truncation, unknown version, or corrupt byte sequence throws before database transactions begin.
