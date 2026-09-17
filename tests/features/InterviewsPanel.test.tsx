import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InterviewsPanel } from "../../src/client/features/interviews/InterviewsPanel";
import type { CandidateApplication, Interview, InterviewDraft } from "../../src/client/App";

const emptyDraft: InterviewDraft = {
  candidateApplicationId: "",
  title: "",
  type: "technical",
  scheduledStartAt: "",
  scheduledEndAt: "",
  timezone: "America/Sao_Paulo",
  locationType: "onsite",
  locationDetails: "",
  reason: ""
};

const activeApplication: CandidateApplication = {
  id: "application-1",
  applicationStatus: "active",
  candidate: { id: "candidate-1", fullName: "Maria Silva" }
};

function makeInterview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: "interview-1",
    candidateApplicationId: activeApplication.id,
    title: "Entrevista técnica",
    type: "technical",
    status: "draft",
    timezone: "America/Sao_Paulo",
    ...overrides
  };
}

describe("InterviewsPanel", () => {
  it("shows an empty state instead of fabricating an interview list", () => {
    render(
      <InterviewsPanel
        canManage
        interviews={[]}
        applications={[activeApplication]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onSchedule={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    );

    expect(screen.getByText("Nenhuma entrevista cadastrada")).toBeInTheDocument();
  });

  it("renders the candidate name and real status for each interview", () => {
    render(
      <InterviewsPanel
        canManage
        interviews={[makeInterview()]}
        applications={[activeApplication]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onSchedule={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    );

    const item = within(screen.getByRole("listitem"));
    expect(item.getByText("Entrevista técnica")).toBeInTheDocument();
    expect(item.getByText(/Maria Silva/)).toBeInTheDocument();
    expect(item.getByText("Rascunho")).toBeInTheDocument();
    expect(item.getByText("sem agenda")).toBeInTheDocument();
  });

  it("shows the action matching each real interview status and calls the right handler", () => {
    const onSchedule = vi.fn();
    const onChangeStatus = vi.fn();
    const { rerender } = render(
      <InterviewsPanel
        canManage
        interviews={[makeInterview({ status: "draft" })]}
        applications={[activeApplication]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onSchedule={onSchedule}
        onChangeStatus={onChangeStatus}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Agendar" }));
    expect(onSchedule).toHaveBeenCalledWith(makeInterview({ status: "draft" }));

    rerender(
      <InterviewsPanel
        canManage
        interviews={[makeInterview({ status: "scheduled" })]}
        applications={[activeApplication]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onSchedule={onSchedule}
        onChangeStatus={onChangeStatus}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Iniciar" }));
    expect(onChangeStatus).toHaveBeenCalledWith(makeInterview({ status: "scheduled" }), "start");

    fireEvent.click(screen.getByRole("button", { name: "No-show" }));
    expect(onChangeStatus).toHaveBeenCalledWith(makeInterview({ status: "scheduled" }), "no-show");
  });

  it("only offers active applications when scheduling a new interview", () => {
    const withdrawnApplication: CandidateApplication = {
      id: "application-2",
      applicationStatus: "withdrawn",
      candidate: { id: "candidate-2", fullName: "Bruno Retirado" }
    };

    render(
      <InterviewsPanel
        canManage
        interviews={[]}
        applications={[activeApplication, withdrawnApplication]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onSchedule={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    );

    const select = screen.getByLabelText("Candidatura") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((option) => option.textContent);
    expect(optionLabels).toContain("Maria Silva");
    expect(optionLabels).not.toContain("Bruno Retirado");
  });

  it("hides management actions when the viewer cannot manage interviews", () => {
    render(
      <InterviewsPanel
        canManage={false}
        interviews={[makeInterview({ status: "scheduled" })]}
        applications={[activeApplication]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onSchedule={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Iniciar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar entrevista" })).not.toBeInTheDocument();
  });
});
