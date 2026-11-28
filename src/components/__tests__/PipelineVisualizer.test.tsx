import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PipelineVisualizer } from "@/components/PipelineVisualizer";
import type { PipelineState } from "@/hooks/useContactProcessing";

const allIdle: PipelineState = {
  mapping: "idle",
  rules: "idle",
  validation: "idle",
  dedup: "idle",
};

const allDone: PipelineState = {
  mapping: "done",
  rules: "done",
  validation: "done",
  dedup: "done",
};

const withError: PipelineState = {
  ...allIdle,
  rules: "error",
};

describe("PipelineVisualizer", () => {
  it("should render all 4 local pipeline steps", () => {
    const { container } = render(<PipelineVisualizer pipelineState={allIdle} />);
    expect(container.textContent).toContain("Mapeo");
    expect(container.textContent).toContain("Reglas");
    expect(container.textContent).toContain("Validar");
    expect(container.textContent).toContain("Dedup");
  });

  it("should render without crashing with all-done state", () => {
    const { container } = render(<PipelineVisualizer pipelineState={allDone} />);
    expect(container.textContent).toContain("Pipeline local de procesamiento");
  });

  it("should render without crashing with error state", () => {
    const { container } = render(<PipelineVisualizer pipelineState={withError} />);
    expect(container).toBeTruthy();
  });
});
