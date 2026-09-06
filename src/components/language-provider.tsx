"use client";

import { Languages } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, {
  LANGUAGE_STORAGE_KEY,
  appLocale,
  normalizeLanguage,
  translateText,
  type AppLanguage,
} from "@/lib/i18n";

type LanguageContextValue = {
  language: AppLanguage;
  locale: string;
  setLanguage: (language: AppLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  locale: "en-US",
  setLanguage: () => undefined,
});

type AppliedValue = { source: string; translated: string };
const TRANSLATABLE_ATTRIBUTES = [
  "aria-label",
  "title",
  "placeholder",
  "alt",
  "label",
  "supporting-text",
  "error-text",
] as const;

function shouldSkip(node: Node) {
  const parent = node instanceof Element ? node : node.parentElement;
  return Boolean(parent?.closest("[data-i18n-ignore], script, style, code, pre"));
}

/**
 * The existing app predates localization and contains a large amount of UI copy.
 * This boundary translates rendered strings and accessible attributes, including
 * content inside Material Web's open shadow roots, while React continues to own
 * structure and state. Source values are retained so switching back to English is
 * lossless and later React updates can be translated as they arrive.
 */
function useLegacyTranslationBoundary(language: AppLanguage) {
  const languageRef = useRef(language);
  const textValues = useRef(new WeakMap<Text, AppliedValue>());
  const attributeValues = useRef(new WeakMap<Element, Map<string, AppliedValue>>());
  const observerRef = useRef<MutationObserver | null>(null);
  const observedRoots = useRef(new WeakSet<Node>());

  const translateNode = useCallback((node: Text, nextLanguage: AppLanguage) => {
    if (shouldSkip(node)) return;
    const current = node.data;
    const saved = textValues.current.get(node);
    const source = saved && current === saved.translated ? saved.source : current;
    const translated = translateText(source, nextLanguage);
    textValues.current.set(node, { source, translated });
    if (current !== translated) node.data = translated;
  }, []);

  const translateAttribute = useCallback(
    (element: Element, attribute: (typeof TRANSLATABLE_ATTRIBUTES)[number], nextLanguage: AppLanguage) => {
      const current = element.getAttribute(attribute);
      if (current === null || shouldSkip(element)) return;
      let savedAttributes = attributeValues.current.get(element);
      if (!savedAttributes) {
        savedAttributes = new Map();
        attributeValues.current.set(element, savedAttributes);
      }
      const saved = savedAttributes.get(attribute);
      const source = saved && current === saved.translated ? saved.source : current;
      const translated = translateText(source, nextLanguage);
      savedAttributes.set(attribute, { source, translated });
      if (current !== translated) element.setAttribute(attribute, translated);
    },
    [],
  );

  const scan = useCallback(
    (root: Node, nextLanguage: AppLanguage) => {
      function scanRoot(currentRoot: Node) {
        const visit = (node: Node) => {
          if (node instanceof Text) {
            translateNode(node, nextLanguage);
            return;
          }
          if (!(node instanceof Element) || shouldSkip(node)) return;
          for (const attribute of TRANSLATABLE_ATTRIBUTES) {
            translateAttribute(node, attribute, nextLanguage);
          }
          if (node.shadowRoot) {
            if (!observedRoots.current.has(node.shadowRoot)) {
              observerRef.current?.observe(node.shadowRoot, {
                childList: true,
                characterData: true,
                subtree: true,
                attributes: true,
                attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
              });
              observedRoots.current.add(node.shadowRoot);
            }
            scanRoot(node.shadowRoot);
          }
        };

        visit(currentRoot);
        const walker = document.createTreeWalker(
          currentRoot,
          NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        );
        let node = walker.nextNode();
        while (node) {
          visit(node);
          node = walker.nextNode();
        }
      }

      scanRoot(root);
    },
    [translateAttribute, translateNode],
  );

  useEffect(() => {
    languageRef.current = language;
    document.documentElement.lang = appLocale(language);
    document.documentElement.dataset.language = language;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    scan(document.documentElement, language);
  }, [language, scan]);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateNode(mutation.target as Text, languageRef.current);
        } else if (mutation.type === "attributes") {
          translateAttribute(
            mutation.target as Element,
            mutation.attributeName as (typeof TRANSLATABLE_ATTRIBUTES)[number],
            languageRef.current,
          );
        } else {
          mutation.addedNodes.forEach((node) => scan(node, languageRef.current));
        }
      }
    });
    observerRef.current = observer;
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });
    observedRoots.current.add(document.documentElement);
    scan(document.documentElement, languageRef.current);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [scan, translateAttribute, translateNode]);
}

export function useAppLanguage() {
  return useContext(LanguageContext);
}

function LanguageToggle({ language, setLanguage }: LanguageContextValue) {
  const chinese = language === "zh";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={chinese}
      aria-label={chinese ? "切换到英文" : "Switch to Chinese"}
      title={chinese ? "切换到英文" : "Switch to Chinese"}
      data-i18n-ignore
      onClick={() => setLanguage(chinese ? "en" : "zh")}
      className="fixed right-4 bottom-4 z-[200] inline-grid h-10 grid-cols-[auto_auto_auto] items-center gap-1 rounded-full border border-ink/10 bg-white/92 p-1 pr-2 text-[11px] font-bold text-text-muted shadow-[0_12px_34px_rgba(25,20,44,0.16)] backdrop-blur-xl transition-colors hover:border-violet/30 max-sm:top-4 max-sm:right-auto max-sm:bottom-auto max-sm:left-1/2 max-sm:h-9 max-sm:-translate-x-1/2 max-sm:grid-cols-2 max-sm:pr-1 dark:border-white/15 dark:bg-[#232229]/92 dark:text-white/70"
    >
      <span className="grid size-8 place-items-center rounded-full bg-violet-soft text-violet-dark max-sm:hidden" aria-hidden>
        <Languages size={15} />
      </span>
      <span className={chinese ? "px-1 opacity-45" : "rounded-full bg-violet px-2 py-1 text-white"}>EN</span>
      <span className={chinese ? "rounded-full bg-violet px-2 py-1 text-white" : "px-1 opacity-45"}>中文</span>
    </button>
  );
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  useEffect(() => {
    const saved = normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? undefined);
    if (saved === "zh") queueMicrotask(() => setLanguageState(saved));
  }, []); // The first render stays English to match server-rendered markup.

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    void i18n.changeLanguage(next);
  }, []);

  useEffect(() => {
    if (normalizeLanguage(i18n.resolvedLanguage) !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  useLegacyTranslationBoundary(language);

  const value = useMemo(
    () => ({ language, locale: appLocale(language), setLanguage }),
    [language, setLanguage],
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageContext.Provider value={value}>
        {children}
        <LanguageToggle {...value} />
      </LanguageContext.Provider>
    </I18nextProvider>
  );
}
