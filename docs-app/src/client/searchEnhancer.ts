type SearchDocument = {
  b?: string[];
  h?: string;
  i?: number;
  p?: number;
  s?: string;
  t?: string;
  u?: string;
};

type SearchChunk = {
  documents?: SearchDocument[];
};

declare global {
  interface Window {
    __nitroSearchDebug?: {
      documentCount: number;
      lastError?: string;
      lastQuery?: string;
      resultCount: number;
    };
  }
}

let initialized = false;
let documentsPromise: Promise<SearchDocument[]> | undefined;

const normalize = (value: string | undefined) =>
  value?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";

const resultUrl = (doc: SearchDocument) =>
  `${doc.u ?? "/"}${doc.h && doc.h !== "#" ? doc.h : ""}`;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const loadDocuments = async () => {
  window.__nitroSearchDebug = window.__nitroSearchDebug ?? {
    documentCount: 0,
    lastError: "loading",
    resultCount: 0,
  };

  if (!documentsPromise) {
    documentsPromise = fetch("/search-index.json")
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok || !text.trim().startsWith("[")) {
          throw new Error(`Search index unavailable: ${res.status}`);
        }
        return JSON.parse(text) as SearchChunk[];
      })
      .then((chunks) => {
        const byUrl = new Map<string, SearchDocument>();
        for (const chunk of chunks) {
          for (const doc of chunk.documents ?? []) {
            if (!doc.u || !doc.t) continue;
            const url = resultUrl(doc);
            const current = byUrl.get(url);
            if (!current || (doc.b?.length ?? 0) > (current.b?.length ?? 0)) {
              byUrl.set(url, doc);
            }
          }
        }
        const docs = Array.from(byUrl.values());
        window.__nitroSearchDebug = {
          documentCount: docs.length,
          resultCount: 0,
        };
        return docs;
      })
      .catch((error: unknown) => {
        documentsPromise = undefined;
        window.__nitroSearchDebug = {
          documentCount: 0,
          lastError: error instanceof Error ? error.message : String(error),
          resultCount: 0,
        };
        return [];
      });
  }
  return documentsPromise;
};

const scoreDocument = (doc: SearchDocument, query: string) => {
  const title = normalize(doc.s ?? doc.t);
  const text = normalize(doc.t);
  const url = normalize(doc.u);
  const crumbs = normalize(doc.b?.join(" "));
  const haystack = `${title} ${text} ${url} ${crumbs}`;

  if (!haystack.includes(query)) return 0;

  let score = 1;
  if (title === query) score += 40;
  if (title.startsWith(query)) score += 24;
  if (title.includes(query)) score += 18;
  if (url.includes(query.replaceAll(" ", "-"))) score += 14;
  if (crumbs.includes(query)) score += 8;
  if (text.includes(query)) score += 4;
  return score;
};

const createModal = () => {
  const overlay = document.createElement("div");
  overlay.className = "nitro-search-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="nitro-search-modal" role="dialog" aria-modal="true" aria-label="Search documentation">
      <div class="nitro-search-input-row">
        <span class="nitro-search-icon" aria-hidden="true">⌕</span>
        <input class="nitro-search-dialog-input" type="search" placeholder="Search or ask a question..." autocomplete="off" spellcheck="false" />
        <span class="nitro-search-assist">Search docs</span>
      </div>
      <div class="nitro-search-results" role="listbox"></div>
      <div class="nitro-search-footer">
        <span>↑↓ Select</span>
        <span>↵ Open</span>
        <span>esc Close</span>
      </div>
    </div>
  `;
  document.body.append(overlay);
  return overlay;
};

const renderResults = (
  queryInput: HTMLInputElement,
  resultsNode: HTMLElement,
  docs: SearchDocument[],
) => {
  const query = normalize(queryInput.value);
  if (query.length < 2) {
    const starter = docs.slice(0, 7);
    resultsNode.innerHTML = `
      <div class="nitro-search-section-label">Start typing to search</div>
      ${starter
        .map((doc, index) => renderResult(doc, index))
        .join("")}
    `;
    updateDebug(docs.length, query, starter.length);
    return;
  }

  const results = docs
    .map((doc) => ({ doc, score: scoreDocument(doc, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.doc);

  updateDebug(docs.length, query, results.length);

  if (results.length === 0) {
    resultsNode.innerHTML = `<div class="nitro-search-empty">No results for <strong>${escapeHtml(queryInput.value)}</strong></div>`;
    return;
  }

  resultsNode.innerHTML = `
    <div class="nitro-search-section-label">Results</div>
    ${results.map((doc, index) => renderResult(doc, index)).join("")}
  `;
};

const renderResult = (doc: SearchDocument, index: number) => {
  const title = doc.s ?? doc.t ?? "Untitled";
  const excerpt = doc.s && doc.t !== doc.s ? doc.t : doc.b?.join(" / ");
  const url = resultUrl(doc);
  return `
    <a class="nitro-search-result${index === 0 ? " is-active" : ""}" href="${url}" role="option">
      <span class="nitro-search-mark" aria-hidden="true">#</span>
      <span>
        <span class="nitro-search-title">${escapeHtml(title)}</span>
        ${excerpt ? `<span class="nitro-search-excerpt">${escapeHtml(excerpt)}</span>` : ""}
      </span>
    </a>
  `;
};

const updateDebug = (documentCount: number, lastQuery: string, resultCount: number) => {
  window.__nitroSearchDebug = {
    ...(window.__nitroSearchDebug ?? {}),
    documentCount,
    lastQuery,
    resultCount,
  };
};

const initSearchEnhancer = () => {
  if (initialized) return;
  const trigger = document.querySelector<HTMLInputElement>("input.navbar__search-input");
  if (!trigger) return;

  initialized = true;
  trigger.setAttribute("autocomplete", "off");
  trigger.setAttribute("spellcheck", "false");
  trigger.placeholder = "Search";
  trigger.readOnly = true;

  const overlay = createModal();
  const dialogInput = overlay.querySelector<HTMLInputElement>(
    ".nitro-search-dialog-input",
  );
  const resultsNode = overlay.querySelector<HTMLElement>(".nitro-search-results");
  if (!dialogInput || !resultsNode) return;

  let docs: SearchDocument[] = [];
  let activeIndex = 0;

  const refresh = () => {
    renderResults(dialogInput, resultsNode, docs);
    activeIndex = 0;
  };

  const ensureDocuments = () => {
    loadDocuments().then((loaded) => {
      docs = loaded;
      refresh();
    });
  };

  const openModal = () => {
    overlay.hidden = false;
    document.documentElement.classList.add("nitro-search-open");
    dialogInput.value = trigger.value;
    dialogInput.focus();
    ensureDocuments();
  };

  const closeModal = () => {
    overlay.hidden = true;
    trigger.value = "";
    document.documentElement.classList.remove("nitro-search-open");
  };

  const setActiveResult = (nextIndex: number) => {
    const results = Array.from(
      resultsNode.querySelectorAll<HTMLAnchorElement>(".nitro-search-result"),
    );
    if (results.length === 0) return;
    results[activeIndex]?.classList.remove("is-active");
    activeIndex = (nextIndex + results.length) % results.length;
    results[activeIndex]?.classList.add("is-active");
    results[activeIndex]?.scrollIntoView({ block: "nearest" });
  };

  trigger.addEventListener("focus", openModal);
  trigger.addEventListener("click", openModal);
  trigger.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openModal();
    }
  });

  dialogInput.addEventListener("input", refresh);
  dialogInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      trigger.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResult(activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult(activeIndex - 1);
      return;
    }
    if (event.key === "Enter") {
      const active = resultsNode.querySelector<HTMLAnchorElement>(
        ".nitro-search-result.is-active",
      );
      if (active) {
        event.preventDefault();
        window.location.href = active.href;
      }
    }
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openModal();
    }
    if (event.key === "Escape" && !overlay.hidden) closeModal();
  });
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const startSearchEnhancer = () => {
    let attempts = 0;
    const tick = () => {
      initSearchEnhancer();
      if (!initialized && attempts < 40) {
        attempts += 1;
        window.setTimeout(tick, 125);
      }
    };
    tick();
  };

  window.addEventListener("DOMContentLoaded", startSearchEnhancer);
  window.addEventListener("load", startSearchEnhancer);
  setTimeout(startSearchEnhancer, 250);
}
