import { describe, expect, it } from "vitest";
import {
  captureScreenshotArgs,
  clickElementArgs,
  fillFieldArgs,
  getConsoleMessagesArgs,
  getNetworkRequestsArgs,
  readPageArgs,
  selectOptionArgs,
  setEditorTextArgs,
  snapshotPageArgs,
  toolDefinitions,
  validateToolArguments,
} from "../../src/agent/tools";

describe("tool schemas", () => {
  it("exposes the nine declared tools", () => {
    expect(toolDefinitions.map((tool) => tool.name).sort()).toEqual([
      "captureScreenshot",
      "clickElement",
      "fillField",
      "getConsoleMessages",
      "getNetworkRequests",
      "readPage",
      "selectOption",
      "setEditorText",
      "snapshotPage",
    ]);
  });

  it("validates getConsoleMessages arguments", () => {
    expect(getConsoleMessagesArgs.parse({}).limit).toBe(50);
    expect(getConsoleMessagesArgs.parse({ limit: 10, level: "error" })).toEqual({
      limit: 10,
      level: "error",
    });
    expect(() => getConsoleMessagesArgs.parse({ limit: 0 })).toThrow();
    expect(() => getConsoleMessagesArgs.parse({ limit: 201 })).toThrow();
    expect(() => getConsoleMessagesArgs.parse({ level: "verbose" })).toThrow();
  });

  it("validates getNetworkRequests arguments", () => {
    expect(getNetworkRequestsArgs.parse({}).limit).toBe(50);
    expect(() => getNetworkRequestsArgs.parse({ limit: 0 })).toThrow();
    expect(() => getNetworkRequestsArgs.parse({ limit: 101 })).toThrow();
  });

  it("validates fillField arguments", () => {
    expect(validateToolArguments("fillField", { selector: "#a", value: "x" })).toEqual({
      selector: "#a",
      value: "x",
    });
    expect(() => validateToolArguments("fillField", { selector: 1 })).toThrow();
  });

  it("validates clickElement arguments", () => {
    expect(clickElementArgs.parse({ selector: "button" }).selector).toBe("button");
    expect(() => clickElementArgs.parse({})).toThrow();
  });

  it("validates selectOption arguments", () => {
    expect(selectOptionArgs.parse({ selector: "s", value: "v" }).value).toBe("v");
    expect(() => selectOptionArgs.parse({ selector: "s" })).toThrow();
  });

  it("readPage defaults mode to full", () => {
    expect(readPageArgs.parse({}).mode).toBe("full");
    expect(readPageArgs.parse({ mode: "selection" }).mode).toBe("selection");
  });

  it("captureScreenshot takes no arguments", () => {
    expect(captureScreenshotArgs.parse({})).toEqual({});
  });

  it("accepts ref as an alternative to selector on interactive tools", () => {
    expect(clickElementArgs.parse({ ref: "e3" }).ref).toBe("e3");
    expect(fillFieldArgs.parse({ ref: "e3", value: "x" }).ref).toBe("e3");
    expect(selectOptionArgs.parse({ ref: "e3", value: "v" }).ref).toBe("e3");
    expect(setEditorTextArgs.parse({ ref: "e3", text: "t" }).ref).toBe("e3");
  });

  it("requires exactly one of selector or ref", () => {
    expect(() => clickElementArgs.parse({})).toThrow();
    expect(() => clickElementArgs.parse({ selector: "#a", ref: "e3" })).toThrow();
    expect(() => fillFieldArgs.parse({ value: "x" })).toThrow();
    expect(() => fillFieldArgs.parse({ selector: "#a", ref: "e3", value: "x" })).toThrow();
    expect(() => setEditorTextArgs.parse({ text: "t" })).toThrow();
    expect(() => setEditorTextArgs.parse({ selector: "#a", ref: "e3", text: "t" })).toThrow();
  });

  it("snapshotPage defaults maxElements to 300", () => {
    expect(snapshotPageArgs.parse({}).maxElements).toBe(300);
    expect(snapshotPageArgs.parse({ maxElements: 50 }).maxElements).toBe(50);
    expect(() => snapshotPageArgs.parse({ maxElements: 0 })).toThrow();
  });

  it("setEditorText defaults mode to replace", () => {
    expect(setEditorTextArgs.parse({ selector: "#e", text: "t" }).mode).toBe("replace");
    expect(setEditorTextArgs.parse({ selector: "#e", text: "t", mode: "insert" }).mode).toBe(
      "insert",
    );
    expect(() => setEditorTextArgs.parse({ selector: "#e", text: "t", mode: "bogus" })).toThrow();
  });

  it("rejects unknown tools", () => {
    expect(() => validateToolArguments("doesNotExist", {})).toThrow();
  });
});
