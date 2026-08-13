import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MessageContent from "../index";

describe("MessageContent", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("does not show raw think tags while streaming an incomplete block", () => {
    const { container } = render(
      <MessageContent content="<think>reasoning" isStreaming />,
    );
    expect(container.textContent).not.toMatch(/<\/?think>/);
  });

  it("renders ordered lists without an em-dash prefix in the DOM", () => {
    render(<MessageContent content={"1. Alpha\n2. Beta"} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent?.trim().startsWith("—")).toBe(false);
    expect(items[0]).toHaveTextContent("Alpha");
  });

  it("renders unordered list items with clean text content", () => {
    render(<MessageContent content={"- One\n- Two"} />);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("One");
  });

  it("renders GFM strikethrough and task list checkboxes", () => {
    render(<MessageContent content={"~~old~~\n\n- [x] Done\n- [ ] Todo"} />);
    expect(document.querySelector("del")).toHaveTextContent("old");
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it("renders GFM tables", () => {
    const md = [
      "| Company | Role |",
      "| --- | --- |",
      "| DoorDash | Engineer |",
    ].join("\n");
    render(<MessageContent content={md} />);
    expect(document.querySelector("table")).toBeTruthy();
    expect(screen.getByText("DoorDash")).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
  });

  it("shows a language label and copy control on fenced code", async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard — re-assert our spy afterward.
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<MessageContent content={"```ts\nconst x = 1\n```"} />);
    expect(screen.getByText("ts")).toBeInTheDocument();
    const copy = screen.getByRole("button", { name: /copy code/i });
    await user.click(copy);
    expect(writeText).toHaveBeenCalledWith("const x = 1");
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("opens external links in a new tab with noopener", () => {
    render(<MessageContent content={"[site](https://example.com)"} />);
    const link = screen.getByRole("link", { name: "site" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
