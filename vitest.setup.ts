import "@testing-library/jest-dom/vitest";

/*
 * Most suites run in jsdom. The migration suite runs in the node environment,
 * because it drives a real PostgreSQL instance and has no use for a DOM, so
 * every shim below is guarded rather than assumed.
 */
const hasDom = typeof window !== "undefined";

/* jsdom implements neither of these, and Radix probes for both. */
if (hasDom && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/*
 * Material Web text fields are form-associated custom elements. jsdom exposes
 * attachInternals(), but its partial ElementInternals object omits the form and
 * validity methods that the real browser API provides.
 */
if (hasDom) {
  Object.defineProperty(HTMLElement.prototype, "attachInternals", {
    configurable: true,
    value() {
      return {
        form: null,
        labels: [],
        validity: {},
        validationMessage: "",
        willValidate: true,
        setFormValue() {},
        setValidity() {},
        checkValidity: () => true,
        reportValidity: () => true,
      };
    },
  });
}
