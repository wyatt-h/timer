import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/components/language-provider";
import { LANGUAGE_STORAGE_KEY, translateText } from "@/lib/i18n";

describe("LanguageProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "en-US";
  });

  it("switches rendered copy and accessible attributes in both directions", async () => {
    render(
      <LanguageProvider>
        <main>
          <h1>Every moment, perfectly timed.</h1>
          <button type="button" title="Open an event">
            How it works
          </button>
        </main>
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Switch to Chinese" }));

    await waitFor(() => {
      expect(screen.getByRole("heading")).toHaveTextContent("每一刻，精准掌控。");
      expect(screen.getByRole("button", { name: "使用方法" })).toHaveAttribute(
        "title",
        "打开活动",
      );
      expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh");
    });

    fireEvent.click(screen.getByRole("switch", { name: "切换到英文" }));

    await waitFor(() => {
      expect(screen.getByRole("heading")).toHaveTextContent("Every moment, perfectly timed.");
      expect(screen.getByRole("button", { name: "How it works" })).toHaveAttribute(
        "title",
        "Open an event",
      );
      expect(document.documentElement).toHaveAttribute("lang", "en-US");
    });
  });

  it("translates dynamic timer and agenda labels", () => {
    expect(translateText("Panelist 3", "zh")).toBe("圆桌嘉宾 3");
    expect(translateText("7 minutes 12 seconds remaining", "zh")).toBe(
      "剩余 7 分钟 12 秒",
    );
    expect(translateText("Panel led by Lin", "zh")).toBe("由 Lin 主持的圆桌讨论");
    expect(translateText("3 events imported", "zh")).toBe("已导入 3 个活动");
    expect(translateText("Part 2 of 5", "zh")).toBe("第 2 段，共 5 段");
    expect(translateText("10 minutes of programme left", "zh")).toBe("流程剩余 10 分钟");
    expect(translateText("3 items · 20 min total", "zh")).toBe("共 3 项 · 20 分钟");
    expect(
      translateText("10 min overtime limit reached. Reset or add time to continue.", "zh"),
    ).toBe("已达到 10 分钟的超时上限。请重置或增加时间以继续。");
  });
});
