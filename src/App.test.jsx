import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App.jsx";

function getStationLabel(container, name) {
  return [...container.querySelectorAll(".station-label")].find((node) => node.textContent === name);
}

describe("App", () => {
  it("defaults to geographic mode on first load", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Geographic" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Official Style" })).toHaveAttribute("aria-pressed", "false");
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
    render(<App />);

    await user.click(screen.getAllByLabelText("Hidden MRT station")[0]);
    await user.type(screen.getByPlaceholderText("Type the station name"), "Admiralty");
    await user.click(screen.getByRole("button", { name: "Submit Guess" }));

    expect(screen.getByText(/Next station selected automatically/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type the station name")).toHaveValue("");
    expect(screen.getByPlaceholderText("Type the station name")).toBeEnabled();
    expect(screen.getByText("Guess This Station")).toBeInTheDocument();
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

  it("preserves solved stations when switching map modes", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getAllByLabelText("Hidden MRT station")[0]);
    await user.type(screen.getByPlaceholderText("Type the station name"), "Admiralty");
    await user.click(screen.getByRole("button", { name: "Submit Guess" }));
    await user.click(screen.getByRole("button", { name: "Official Style" }));

    const admiraltyLabel = getStationLabel(container, "Admiralty");

    expect(admiraltyLabel).toHaveClass("visible");
    expect(screen.getByText(/1 of 139 stations revealed/i)).toBeInTheDocument();
  });

  it("renders zoom controls for dense downtown areas", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset zoom and pan" })).toBeInTheDocument();
  });
});
