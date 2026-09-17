import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CandidatesPanel } from "../../src/client/features/candidates/CandidatesPanel";
import type { Candidate, CandidateDraft } from "../../src/client/App";

const emptyDraft: CandidateDraft = {
  fullName: "",
  preferredName: "",
  email: "",
  source: "manual",
  city: "",
  state: "",
  professionalSummary: ""
};

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "candidate-1",
    fullName: "Maria Silva",
    preferredName: null,
    status: "active",
    source: "linkedin",
    professionalSummary: null,
    experiences: [],
    education: [],
    certifications: [],
    languages: [],
    declaredCompetencies: [],
    professionalLinks: [],
    ...overrides
  };
}

describe("CandidatesPanel", () => {
  it("shows an empty state instead of fabricating a candidate list", () => {
    render(
      <CandidatesPanel
        canManage
        candidates={[]}
        inactiveCandidates={[]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    );

    expect(screen.getByText("Nenhum candidato ativo")).toBeInTheDocument();
  });

  it("renders real candidate data", () => {
    const candidate = makeCandidate({ city: "São Paulo", state: "SP" });
    render(
      <CandidatesPanel
        canManage
        candidates={[candidate]}
        inactiveCandidates={[]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    );

    const item = within(screen.getByRole("listitem"));
    expect(item.getByText("Maria Silva")).toBeInTheDocument();
    expect(item.getByText(/linkedin/)).toBeInTheDocument();
    expect(item.getByText(/São Paulo/)).toBeInTheDocument();
  });

  it("calls onChangeStatus with the correct action for active and inactive candidates", () => {
    const onChangeStatus = vi.fn();
    const active = makeCandidate({ id: "c-active", fullName: "Ana Ativa" });
    const inactive = makeCandidate({
      id: "c-inactive",
      fullName: "Bruno Inativo",
      status: "inactive"
    });

    render(
      <CandidatesPanel
        canManage
        candidates={[active]}
        inactiveCandidates={[inactive]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onChangeStatus={onChangeStatus}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Inativar" }));
    expect(onChangeStatus).toHaveBeenCalledWith(active, "inactivate");

    fireEvent.click(screen.getByRole("button", { name: "Reativar" }));
    expect(onChangeStatus).toHaveBeenCalledWith(inactive, "reactivate");
  });

  it("patches the draft through onDraftChange when filling the new-candidate form", () => {
    const onDraftChange = vi.fn();
    render(
      <CandidatesPanel
        canManage
        candidates={[]}
        inactiveCandidates={[]}
        draft={emptyDraft}
        onDraftChange={onDraftChange}
        onCreate={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Carlos Souza" }
    });
    expect(onDraftChange).toHaveBeenCalledWith({ fullName: "Carlos Souza" });

    fireEvent.click(screen.getByRole("button", { name: "Criar candidato" }));
  });

  it("hides management actions and forms when the viewer cannot manage candidates", () => {
    render(
      <CandidatesPanel
        canManage={false}
        candidates={[makeCandidate()]}
        inactiveCandidates={[]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Inativar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar candidato" })).not.toBeInTheDocument();
  });
});
