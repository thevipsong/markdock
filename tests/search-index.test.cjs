const test = require("node:test");
const assert = require("node:assert/strict");

require("../search-index.js");

const makeIndex = () => globalThis.MarkDockSearch.createIndex();
const noPinyin = () => false;

test("matches case-insensitive bookmark text and domain filters", () => {
  const index = makeIndex();
  const item = {
    id: "bookmark-1",
    title: "Design System",
    url: "https://docs.example.com/guide",
    category: "Work",
    group: "Product",
    path: ["Work", "Product"]
  };

  assert.equal(index.matches(item, ["design"], [null], "DESIGN", {}, noPinyin), true);
  assert.equal(index.matches(item, ["site:example.com"], ["example.com"], "SITE:EXAMPLE.COM", {}, noPinyin), true);
  assert.equal(index.matches(item, ["site:other.com"], ["other.com"], "SITE:OTHER.COM", {}, noPinyin), false);
});

test("supports tag and reading-state operators without bypassing their filters", () => {
  const index = makeIndex();
  const item = { id: "bookmark-2", title: "Reading list", url: "https://example.com/read" };
  const metadata = { tags: ["Design", "Reference"], readStatus: "later" };
  const alwaysPinyin = () => true;

  assert.equal(index.matches(item, ["tag:design"], [null], "TAG:DESIGN", metadata, noPinyin), true);
  assert.equal(index.matches(item, ["is:later"], [null], "IS:LATER", metadata, noPinyin), true);
  assert.equal(index.matches(item, ["is:read"], [null], "IS:READ", metadata, alwaysPinyin), false);
  assert.equal(index.matches(item, ["tag:missing"], [null], "TAG:MISSING", metadata, alwaysPinyin), false);
});

test("uses pinyin callback for titles and rebuilds cached text after edits", () => {
  const index = makeIndex();
  const item = { id: "bookmark-3", title: "Windows Desktop", url: "https://example.com" };
  const initials = (title, query) => title === "Windows Desktop" && query.toLowerCase() === "wd";

  assert.equal(index.matches(item, ["wd"], [null], "WD", {}, initials), true);
  item.title = "Workspace Dashboard";
  assert.equal(index.matches(item, ["windows"], [null], "WINDOWS", {}, noPinyin), false);
  assert.equal(index.matches(item, ["workspace"], [null], "WORKSPACE", {}, noPinyin), true);
});
