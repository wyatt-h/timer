"use client";

import { AlertCircle, Download, FileUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseEventCsv } from "@/lib/csv";
import { formatDuration, eventDuration } from "@/lib/format";
import type { TimerEvent } from "@/lib/types";

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onImport: (events: TimerEvent[]) => void;
};

const COLUMNS = [
  { name: "event_name", required: true, note: "Rows sharing a name become one event." },
  { name: "item_type", required: true, note: "“single” or “panel”." },
  { name: "item_order", required: false, note: "Position in the run of show. Groups panelists." },
  { name: "speaker_name", required: false, note: "The speaker, or one panelist per row." },
  { name: "panel_host", required: false, note: "Who runs a panel. Shown as “Panel led by …”." },
  { name: "duration_minutes", required: false, note: "Length of a single talk. Default 10." },
  { name: "event_date", required: false, note: "YYYY-MM-DD. Taken from the first row." },
  { name: "panel_total_minutes", required: false, note: "Whole panel slot. Default: sum of panelists." },
  { name: "speaker_minutes", required: false, note: "One panelist's time." },
  { name: "speaker_default_minutes", required: false, note: "Fallback per panelist. Default 5." },
];

export function ImportDialog({ open, onClose, onImport }: ImportDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<TimerEvent[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      // Each time the dialog opens it starts from a clean slate.
      setError("");
      setParsed(null);
      setFileName("");
      setIsDragging(false);
      element.showModal();
    }
    if (!open && element.open) element.close();
  }, [open]);

  async function readFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    try {
      const events = parseEventCsv(await file.text());
      setParsed(events);
      setError("");
    } catch (caught) {
      setParsed(null);
      setError(caught instanceof Error ? caught.message : "The CSV could not be read.");
    }
  }

  function confirmImport() {
    if (!parsed) return;
    onImport(parsed);
    onClose();
  }

  return (
    <dialog
      className="agenda-dialog m-auto max-h-[calc(100dvh-3rem)] w-[min(880px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-panel border border-line bg-white p-0 text-ink shadow-[0_30px_80px_rgba(20,16,38,0.24)] backdrop:bg-[rgba(16,14,26,0.44)] backdrop:backdrop-blur-[3px]"
      ref={dialog}
      aria-labelledby="import-title"
      onCancel={(event) => {
        /*
         * A file input emits its own bubbling `cancel` event when the native
         * picker is dismissed without a selection. Only a cancel originating
         * from the dialog itself (for example, Escape) should close the modal.
         */
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 pt-5 pb-3.5">
        <h2 id="import-title" className="text-[17px] font-semibold tracking-[-0.03em]">Import events from CSV</h2>
        <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-[9px] text-text-subtle transition-colors duration-150 hover:bg-surface-hover hover:text-ink">
          <X size={16} />
        </button>
      </div>

      <div className="grid gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section>
          <p className="text-[13px] leading-relaxed text-text-muted">
            One row per speaker. Rows that share an <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[12px] text-violet-dark">event_name</code> become one event, and
            rows that share an <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[12px] text-violet-dark">item_order</code> become one agenda item — that is how a panel
            gets several panelists.
          </p>

          <h3 className="mt-4 mb-2 text-[13px] font-semibold">Columns</h3>
          <ul className="grid gap-2">
            {COLUMNS.map((column) => (
              <li key={column.name} className="flex flex-wrap items-baseline gap-1.5">
                <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[12px] text-violet-dark">{column.name}</code>
                {column.required && <span className="rounded-full bg-over-soft px-1.5 py-0.5 text-[12px] font-bold text-over uppercase">required</span>}
                <span className="text-[12px] leading-relaxed text-text-subtle">{column.note}</span>
              </li>
            ))}
          </ul>

          <h3 className="mt-4 mb-2 text-[13px] font-semibold">Example</h3>
          <p className="text-[12px] leading-relaxed text-text-subtle">
            A 12-minute talk, then a 30-minute panel of two, then an 8-minute talk.
          </p>
          <div role="img" aria-label="Example CSV contents" className="overflow-x-auto rounded-md bg-surface-sunken p-3">
            <pre className="font-mono text-[12px] leading-relaxed whitespace-pre text-text-muted">
{`event_name,item_order,item_type,panel_host,speaker_name,duration_minutes,panel_total_minutes,speaker_minutes
Summit,1,single,,Maya Chen,12,,
Summit,2,panel,Ana Torres,Noah Williams,,30,15
Summit,2,panel,Ana Torres,Sofia Patel,,30,15
Summit,3,single,,Elena Park,8,,`}
            </pre>
          </div>

          <ul className="my-3.5 grid list-disc gap-1.5 pl-5 text-[12px] leading-relaxed text-text-subtle">
            <li>
              Both panel rows repeat <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[12px] text-violet-dark">item_order</code> 2, so they join the same panel.
            </li>
            <li>
              Leave <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[12px] text-violet-dark">item_order</code> out entirely and every row becomes its own item.
            </li>
            <li>Agenda items have no titles — a speaker&apos;s name is the label.</li>
            <li>Column order does not matter, and extra columns are ignored.</li>
          </ul>

          <Button asChild variant="secondary" size="sm"><a href="/event-import-template.csv" download>
            <Download size={14} />
            Download template
          </a></Button>
        </section>

        <section className="grid content-start gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              void readFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          <div
            className={cn(
              "grid min-h-[190px] place-items-center gap-2.5 rounded-card border border-dashed border-violet/30 bg-violet-soft/35 p-5 text-center text-text-subtle transition-[border-color,background-color] duration-150",
              isDragging && "border-violet bg-violet-soft/75",
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void readFile(event.dataTransfer.files?.[0]);
            }}
          >
            <FileUp size={22} />
            <p className="text-[13px]">Drop a CSV here</p>
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
              Choose a file
            </Button>
          </div>

          <div aria-live="polite" className="grid gap-3 empty:hidden">
            {error && (
              <p className="flex items-start gap-2 rounded-control border border-over/20 bg-over-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-over">
                <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
                <span>
                  <strong>{fileName || "That file"}</strong> could not be imported. {error}
                </span>
              </p>
            )}

            {parsed && (
              <div className="rounded-control border border-success/20 bg-success-soft p-3.5">
                <strong className="mb-2 block text-[13px] text-success">
                  {parsed.length} event{parsed.length === 1 ? "" : "s"} ready
                </strong>
                <ul className="grid gap-1.5">
                  {parsed.map((event) => (
                    <li key={event.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span>{event.name}</span>
                      <span className="text-[12px] leading-relaxed text-text-subtle">
                        {event.agenda.length} item{event.agenda.length === 1 ? "" : "s"} ·{" "}
                        {formatDuration(eventDuration(event))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="flex justify-end gap-2 border-t border-line bg-surface-raised px-5 py-3.5">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!parsed} onClick={confirmImport}>
          {parsed
            ? `Import ${parsed.length} event${parsed.length === 1 ? "" : "s"}`
            : "Import"}
        </Button>
      </div>
    </dialog>
  );
}
