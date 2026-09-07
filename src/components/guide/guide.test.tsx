import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningGuide } from "@/components/guide/learning-guide";
import { LessonPage } from "@/components/guide/lesson-page";
import { PracticeEvent } from "@/components/guide/practice-event";
import { ShareDemo, ZoomDemo } from "@/components/guide/lesson-demos";
import { ContextHelp } from "@/components/context-help";
import { ScreenshotGuide, ScreenshotGallery } from "@/components/guide/screenshot-guide";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({}) }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Timer learning area", () => {
  it("searches button behavior and provides direct lesson links", () => {
    render(<LearningGuide />);
    expect(screen.getByRole("link", { name: /Try a practice event/ })).toHaveAttribute("href", "/guide/practice");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "invitation" } });
    expect(screen.getByText("Event access / Create invitation link")).toBeInTheDocument();
    expect(screen.queryByText("Reset current topic")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "does-not-exist" } });
    expect(screen.getByText(/No matching controls/)).toBeInTheDocument();
  });

  it("lets readers skip to an instruction and replay a completed lesson", () => {
    render(<LessonPage lessonId="create" />);
    fireEvent.click(screen.getByRole("button", { name: /Return on another device/ }));
    fireEvent.click(screen.getByRole("button", { name: /Finish lesson/ }));
    expect(screen.getByRole("heading", { name: "Try it for yourself." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replay lesson" }));
    expect(screen.getByRole("heading", { name: "Start from the home screen", level: 2 })).toBeInTheDocument();
  });

  it("runs the real timing controls locally and advances only after successful state changes", () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<PracticeEvent />);
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+1m" }));
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+15s" }));
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next part.*Mina/ }));
    expect(screen.getByText("Lesson complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start speaker" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create invitation link/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy speaker link" }));
    expect(screen.getByText(/Practice only: no public link was copied/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps a panel running when only the speaker is paused", () => {
    render(<PracticeEvent mode="panel" />);
    fireEvent.click(screen.getByRole("button", { name: "Start speaker" }));
    expect(screen.getByRole("button", { name: "Pause panel" })).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Adjust time for Mina Patel" });
    expect(group).toHaveAttribute("data-practice-highlight", "true");
    fireEvent.click(within(group).getByRole("button", { name: "Add fifteen seconds" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause speaker" }));
    expect(screen.getByRole("button", { name: "Pause panel" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next panelist.*Theo/ }));
    expect(screen.getByText("Lesson complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause panel" })).toBeInTheDocument();
  });

  it("uses the actual agenda editor without creating a remote event", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<PracticeEvent mode="build" />);
    expect(screen.getByRole("button", { name: "Add speaker" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save & practise" }));
    expect(screen.getByRole("button", { name: "Start timer" })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opens collapsed help targets without invoking the control and clears on Escape", () => {
    const action = vi.fn();
    render(<><ContextHelp context="control" /><details data-help="zoom-code"><summary>Zoom code</summary><button onClick={action}>Create Zoom code</button></details></>);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom code / Copy / Create Zoom code" }));
    fireEvent.click(screen.getByRole("button", { name: "Show me where" }));
    const target = screen.getByText("Zoom code", { exact: true }).closest("details");
    expect(target).toHaveAttribute("open");
    expect(target).toHaveAttribute("data-help-highlight", "true");
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Back to instructions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show me where" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(target).not.toHaveAttribute("data-help-highlight");
    expect(screen.getByRole("button", { name: "Help" })).toHaveFocus();
  });

  it("reports unavailable controls instead of pointing at a missing target", () => {
    render(<ContextHelp context="control" />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    fireEvent.click(screen.getByRole("button", { name: "Start panel / Pause panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Show me where" }));
    expect(screen.getByRole("status")).toHaveTextContent("not shown in the current view");
  });

  it("lets users select screenshot annotations with keyboard-accessible buttons", () => {
    render(<ScreenshotGuide screenshot={{ src: "/guide/example.png", width: 1000, height: 600, alt: "Sample controls", caption: "A sample event", hotspots: [
      { label: "Start", description: "Begin the countdown.", x: 20, y: 50 },
      { label: "Pause", description: "Hold the remaining time.", x: 60, y: 50 },
    ] }} />);
    fireEvent.click(screen.getByRole("button", { name: "2. Pause" }));
    expect(screen.getByText("Hold the remaining time.", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Locate Pause" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Enlarge screenshot" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show button markers" }));
    expect(screen.queryByRole("button", { name: "Locate Pause" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Sample controls" })).toHaveAttribute("src", "/guide/example.png");
    expect(screen.getByRole("link", { name: "Open original image" })).toHaveAttribute("href", "/guide/example.png");
  });

  it("switches real screenshots and keeps the current lesson step aligned", () => {
    render(<LessonPage lessonId="run" />);
    fireEvent.click(screen.getByRole("button", { name: /Control a panel/ }));
    expect(screen.getByRole("button", { name: "Panel controls" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Open original image" })).toHaveAttribute("href", "/guide/panel.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Speaker controls" }));
    expect(screen.getByRole("link", { name: "Open original image" })).toHaveAttribute("href", "/guide/control.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByRole("button", { name: "Speaker controls" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not render a gallery without captures", () => {
    render(<ScreenshotGallery screenshots={[]} />);
    expect(screen.queryByRole("region", { name: "Screenshots of the actual website" })).not.toBeInTheDocument();
  });

  it("teaches read-only versus controller access without creating invitations", () => {
    render(<ShareDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Copy speaker link" }));
    expect(screen.getByRole("status")).toHaveTextContent("cannot edit or control");
    fireEvent.click(screen.getByRole("button", { name: "Controller invitation" }));
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));
    expect(screen.getByRole("status")).toHaveTextContent("can control this event");
  });

  it("separates Zoom pairing, publishing, running, and disconnecting", () => {
    render(<ZoomDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("alert")).toHaveTextContent("DEMO-CODE");
    fireEvent.click(screen.getByRole("button", { name: "Copy Zoom code" }));
    fireEvent.click(screen.getByRole("button", { name: "Paste sample code" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByText(/Connected, but nothing is shared/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sync to Zoom" }));
    expect(screen.getByText(/Waiting for the timer to start/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    expect(screen.getByText(/The meeting can see the timer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
    expect(screen.getByText(/The paused countdown remains visible/)).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing timer" }));
    expect(screen.queryByText("05:00")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByText("No timer is shared. Connect the sample event first.")).toBeInTheDocument();
  });
});
