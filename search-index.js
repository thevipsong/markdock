/* Cached text fields for responsive local bookmark search. */
(() => {
  "use strict";

  class BookmarkSearchIndex {
    constructor() {
      this.records = new Map();
      this.queryCount = 0;
    }

    record(item, metadata = {}) {
      const id = String(item.id || item.chromeId || item.url);
      const tags = Array.isArray(metadata.tags) ? metadata.tags : (Array.isArray(item.tags) ? item.tags : []);
      const note = String(metadata.note ?? item.note ?? "");
      const signature = [item.title, item.url, item.category, item.group,
        Array.isArray(item.path) ? item.path.join(" ") : "", tags.join(" "), note].join("\u0000");
      const current = this.records.get(id);
      if (current?.signature === signature) return current;

      const url = String(item.url || "");
      let host = "";
      try { host = new URL(url).hostname.toLocaleLowerCase(); } catch { /* non-web bookmarks */ }
      const text = [item.title, url, item.category, item.group,
        Array.isArray(item.path) ? item.path.join(" ") : "", tags.join(" "), note]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      const next = { signature, text, host };
      this.records.delete(id);
      this.records.set(id, next);
      if (this.records.size > 24_000) this.records.delete(this.records.keys().next().value);
      return next;
    }

    matches(item, tokens, domainQueries, compactQuery, metadata, initialsMatch) {
      const record = this.record(item, metadata);
      const title = String(item.title || "");
      const path = Array.isArray(item.path) ? item.path.join(" ") : "";
      const url = String(item.url || "").toLocaleLowerCase();
      const allTokensMatch = tokens.every((token, index) => {
        const domain = domainQueries[index];
        if (domain) return record.host.includes(domain) || url.includes(domain);
        const tag = token.match(/^tag:(.+)$/i)?.[1];
        if (tag) return (metadata.tags || item.tags || []).some((value) => String(value).toLocaleLowerCase().includes(tag));
        const status = token.match(/^is:(unread|later|read)$/i)?.[1];
        if (status) return (metadata.readStatus || item.readStatus || "none") === status;
        return record.text.includes(token)
          || initialsMatch(title, token)
          || initialsMatch(path, token);
      });
      if (allTokensMatch) return true;
      const hasStructuredToken = domainQueries.some(Boolean) || tokens.some((token) =>
        /^tag:.+$/i.test(token) || /^is:(?:unread|later|read)$/i.test(token)
      );
      return Boolean(!hasStructuredToken && compactQuery
        && (initialsMatch(title, compactQuery) || initialsMatch(path, compactQuery)));
    }

    prune(items) {
      this.queryCount++;
      if (this.queryCount % 32 !== 0 || this.records.size <= items.length + 256) return;
      const liveIds = new Set(items.map((item) => String(item.id || item.chromeId || item.url)));
      for (const id of this.records.keys()) if (!liveIds.has(id)) this.records.delete(id);
    }
  }

  globalThis.MarkDockSearch = Object.freeze({ createIndex: () => new BookmarkSearchIndex() });
})();
