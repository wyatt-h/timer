import type { LessonId } from "@/lib/guide";

export type GuideScreenshot = {
  title?: string;
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  hotspots: { label: string; description: string; x: number; y: number }[];
};

// Original browser captures, with annotations rendered separately by the guide.
const home: GuideScreenshot = {
  title: "Home screen", src: "/guide/home.jpg", width: 1280, height: 725,
  alt: "Timer home page with Create an event selected, New event, and Import from CSV.",
  caption: "Actual Timer home screen. Choose New event or Import from CSV.",
  hotspots: [
    { label: "Create an event", description: "Select the creation tab to see both ways to create an event.", x: 45.1, y: 49.1 },
    { label: "New event", description: "Open the form to choose event access before building the agenda.", x: 50, y: 68.1 },
    { label: "Import from CSV", description: "Open the CSV importer for one event or multiple events.", x: 50, y: 75.9 },
  ],
};
const creation: GuideScreenshot = {
  title: "Event access", src: "/guide/create.jpg", width: 1280, height: 1061,
  alt: "Actual event creation form with login name, password, password confirmation, and Create event.",
  caption: "Actual creation form, captured with the credential fields empty.",
  hotspots: [
    { label: "Login name", description: "Choose the event’s unique lowercase login name.", x: 50, y: 57.8 },
    { label: "Password", description: "Choose an event password of at least six characters, then repeat it below.", x: 50, y: 65.7 },
    { label: "Create event", description: "Create the event, then continue to its agenda editor.", x: 50, y: 86.9 },
  ],
};
const csv: GuideScreenshot = {
  title: "CSV import", src: "/guide/import.jpg", width: 1280, height: 720,
  alt: "Timer’s CSV import dialog with column instructions, a file drop area, Choose a file, and Import.",
  caption: "Actual CSV import dialog. Scroll within the dialog for the template download and examples.",
  hotspots: [
    { label: "CSV columns", description: "event_name groups events; item_order groups the panelists in an agenda item.", x: 24.2, y: 40.9 },
    { label: "Choose a file", description: "Select your CSV or drag it into this area to preview the import.", x: 67.9, y: 36 },
    { label: "Import", description: "This becomes available after the file is parsed. Event credentials are chosen in the following step.", x: 80, y: 91.5 },
  ],
};
const editor: GuideScreenshot = {
  title: "Agenda editor", src: "/guide/editor.jpg", width: 1280, height: 1173,
  alt: "Real Timer event editor showing a single speaker, a two-person panel, event details, and save controls.",
  caption: "Actual event editor with sample event data. The layout and controls are unchanged.",
  hotspots: [
    { label: "Save changes", description: "Save the edited event details and agenda.", x: 74.7, y: 11.1 },
    { label: "Speaker duration", description: "Set the number of minutes for this speaker.", x: 55.8, y: 33.5 },
    { label: "Panel total", description: "Set the overall panel duration independently of each panelist’s time.", x: 56.1, y: 46.7 },
    { label: "Add speaker", description: "Append an individual speaker to the agenda.", x: 22.5, y: 89.9 },
    { label: "Add panel", description: "Append a panel with its own total and panelist allocations.", x: 49.2, y: 89.9 },
  ],
};
const control: GuideScreenshot = {
  title: "Speaker controls", src: "/guide/control.jpg", width: 1280, height: 868,
  alt: "Actual Timer control room with Avery Chen at five minutes, time adjustments, reset, next part, and upcoming agenda.",
  caption: "Actual control room with a sample event. Start, adjust, reset, and move to the next speaker here.",
  hotspots: [
    { label: "Start timer", description: "Begin the current speaker’s countdown. The same button becomes Pause timer.", x: 16.4, y: 43.3 },
    { label: "Time adjustments", description: "Add or remove fifteen seconds or one minute from the speaker clock.", x: 19.6, y: 51.2 },
    { label: "Reset", description: "Restore the allotted time after confirmation.", x: 16.4, y: 57 },
    { label: "Next part", description: "Load the next speaker paused at their allotted time.", x: 23, y: 73.1 },
  ],
};
const panel: GuideScreenshot = {
  title: "Panel controls", src: "/guide/panel.jpg", width: 1280, height: 1125,
  alt: "Actual panel control room with separate five-minute speaker and twenty-minute panel clocks, next panelist, and skip panel.",
  caption: "Actual panel controls with sample data. Speaker and panel clocks have separate controls.",
  hotspots: [
    { label: "Start speaker", description: "Start the speaker countdown and a panel total that is not already running.", x: 16.4, y: 34.1 },
    { label: "Start panel", description: "Start the overall panel clock. Pausing this clock also pauses a running speaker.", x: 16.4, y: 54 },
    { label: "Next panelist", description: "Move to the next speaker, paused, while a running panel total continues.", x: 23, y: 76.3 },
    { label: "Skip panel", description: "Skip the rest of the panel and move to the next agenda item.", x: 16.4, y: 82.3 },
  ],
};
const sharing: GuideScreenshot = {
  title: "Sharing & Zoom code", src: "/guide/sharing.jpg", width: 1280, height: 1159,
  alt: "Actual control room with Speaker view in the header and expanded Zoom code and Event access sections.",
  caption: "Actual sharing controls with sample data. The all-zero Zoom code is a local example, not a code to use.",
  hotspots: [
    { label: "Speaker view", description: "Open the anonymous read-only display; the adjacent copy icon copies its link.", x: 81.8, y: 3.4 },
    { label: "Copy Zoom code", description: "Copy your event’s code and paste it into Timer inside a Zoom meeting.", x: 26.7, y: 64.9 },
    { label: "Copy login details", description: "Prepare controller credentials to share with another operator.", x: 16.4, y: 78 },
    { label: "Create invitation", description: "Create a reusable 24-hour link that gives another person event control.", x: 16.4, y: 81.7 },
  ],
};
const zoom: GuideScreenshot = {
  title: "Zoom app page", src: "/guide/zoom-browser.jpg", width: 1280, height: 934,
  alt: "Actual Timer Zoom app page in browser preview, showing the Zoom code input, Connect, and disabled Sync to Zoom.",
  caption: "Actual Timer Zoom page in a browser. Publishing is disabled here; open Timer inside a supported Zoom meeting to enable it.",
  hotspots: [
    { label: "Zoom code", description: "Paste the code from your event’s control room.", x: 50, y: 19.2 },
    { label: "Connect", description: "Connect the app to the event. This alone does not publish a timer.", x: 50, y: 25.2 },
    { label: "Sync to Zoom", description: "Available after connecting inside a supported Zoom meeting. Choose this to publish the running timer.", x: 50, y: 40.8 },
  ],
};

export const guideScreenshots: Partial<Record<LessonId, GuideScreenshot[]>> = {
  create: [home, creation, editor, csv], build: [editor], run: [control, panel], share: [sharing], zoom: [sharing, zoom],
};
