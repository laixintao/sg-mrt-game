import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

function getStationLabel(container, name) {
  return [...container.querySelectorAll(".station-label")].find((node) => node.textContent === name);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("App", () => {
  it("shows the geographic map by default", () => {
    render(<App />);

    expect(screen.getByText(/Real Singapore coastline and major waterways/i)).toBeInTheDocument();
  });

  it("does not reveal the selected station label before solving", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const firstStationButton = screen.getAllByLabelText("Hidden MRT station")[0];
    const admiraltyLabel = getStationLabel(container, "Admiralty");

    expect(admiraltyLabel).not.toHaveClass("visible");

    await user.click(firstStationButton);

    expect(admiraltyLabel).not.toHaveClass("visible");
    expect(screen.getByText("Guess This Station")).toBeInTheDocument();
  });

  it("shows autocomplete suggestions and accepts enter on the highlighted suggestion", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByLabelText("Hidden MRT station")[0]);
    await user.type(screen.getByPlaceholderText("Type the station name"), "admi");

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Admiralty/i })).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(screen.getByText(/Admiralty is correct/i)).toBeInTheDocument();
  });

  it("automatically selects the next station after a correct guess", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getAllByLabelText("Hidden MRT station")[0]);
    await user.type(screen.getByPlaceholderText("Type the station name"), "Admiralty");
    await user.click(screen.getByRole("button", { name: "Submit Guess" }));

    expect(screen.getByText(/Next station selected automatically/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type the station name")).toHaveValue("");
    expect(screen.getByPlaceholderText("Type the station name")).toBeEnabled();
    expect(screen.getByText("Guess This Station")).toBeInTheDocument();
    expect(container.querySelector(".station-celebration-ring")).toBeInTheDocument();
  });

  it("keeps the station selected and hidden after a wrong guess", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getAllByLabelText("Hidden MRT station")[0]);
    await user.type(screen.getByPlaceholderText("Type the station name"), "Bedok");
    await user.click(screen.getByRole("button", { name: "Submit Guess" }));

    const admiraltyLabel = getStationLabel(container, "Admiralty");

    expect(screen.getByText(/not correct/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bedok")).toBeInTheDocument();
    expect(admiraltyLabel).not.toHaveClass("visible");
    expect(screen.getByText("Guess This Station")).toBeInTheDocument();
  });

  it("keeps solved stations visible after a correct guess", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getAllByLabelText("Hidden MRT station")[0]);
    await user.type(screen.getByPlaceholderText("Type the station name"), "Admiralty");
    await user.click(screen.getByRole("button", { name: "Submit Guess" }));

    const admiraltyLabel = getStationLabel(container, "Admiralty");

    expect(admiraltyLabel).toHaveClass("visible");
    expect(screen.getByText(/1 of 139 stations revealed/i)).toBeInTheDocument();
  });

  it("renders zoom controls for dense downtown areas", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Zoom to 200 percent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset zoom and pan" })).toBeInTheDocument();
  });

  it("shows a hint after 5 seconds on the same station", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getAllByLabelText("Hidden MRT station")[0]);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText(/^Hint$/i)).toBeInTheDocument();
    expect(screen.getByText(/starts with|initials/i)).toBeInTheDocument();
  });

  it("does not show hints when auto hints are turned off", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Auto hints after 5s: On/i }));
    fireEvent.click(screen.getAllByLabelText("Hidden MRT station")[0]);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText(/^Hint$/i)).not.toBeInTheDocument();
  });
});
