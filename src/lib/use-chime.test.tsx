import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHIME_PRESETS, CHIME_SECONDS, useChime } from "@/lib/use-chime";

class FakeAudioParam {
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeGain {
  gain = new FakeAudioParam();
  connect = vi.fn();
}

class FakeOscillator {
  type: OscillatorType = "sine";
  frequency = new FakeAudioParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  state: AudioContextState = "suspended";
  currentTime = 10;
  destination = {};
  oscillators: FakeOscillator[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createGain = vi.fn(() => new FakeGain());
  createOscillator = vi.fn(() => {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

describe("useChime", () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("can be enabled, disabled, and enabled again", async () => {
    const { result } = renderHook(() => useChime());

    await act(async () => {
      expect(await result.current.unlock()).toBe(true);
    });
    expect(result.current.isReady).toBe(true);

    await act(async () => {
      await result.current.disable();
    });
    expect(result.current.isReady).toBe(false);
    expect(FakeAudioContext.instances[0].suspend).toHaveBeenCalledOnce();

    await act(async () => {
      expect(await result.current.unlock()).toBe(true);
    });
    expect(result.current.isReady).toBe(true);
  });

  it("can enable audio and preview a sound in the same first click", async () => {
    const { result } = renderHook(() => useChime());

    await act(async () => {
      expect(await result.current.play("warm")).toBe(true);
    });

    expect(result.current.isReady).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].resume).toHaveBeenCalledOnce();
    expect(FakeAudioContext.instances[0].oscillators).toHaveLength(2);
  });

  it("resumes an idle context and schedules one soft 1.5-second bell", async () => {
    const { result } = renderHook(() => useChime());
    await act(async () => {
      await result.current.unlock();
      await result.current.disable();
    });

    await act(async () => {
      expect(await result.current.play()).toBe(true);
    });

    const audio = FakeAudioContext.instances[0];
    expect(audio.resume).toHaveBeenCalledTimes(2);
    expect(audio.oscillators).toHaveLength(1);
    expect(audio.oscillators[0].type).toBe("sine");
    expect(
      audio.oscillators[0].frequency.setValueAtTime.mock.calls[0][0],
    ).toBe(523.25);
    for (const oscillator of audio.oscillators) {
      expect(oscillator.start).toHaveBeenCalledWith(audio.currentTime);
      expect(oscillator.stop).toHaveBeenCalledWith(
        audio.currentTime + CHIME_SECONDS,
      );
    }
    expect(CHIME_SECONDS).toBe(1.5);
  });

  it("can preview every available sound preset", async () => {
    const { result } = renderHook(() => useChime());
    await act(async () => {
      await result.current.unlock();
    });

    for (const preset of CHIME_PRESETS) {
      await act(async () => {
        expect(await result.current.play(preset.id)).toBe(true);
      });
    }

    expect(FakeAudioContext.instances[0].oscillators).toHaveLength(9);
  });
});
