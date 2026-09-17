import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectionPanel } from "../../src/client/features/selection/SelectionPanel";
import type {
  Candidate,
  CandidateApplication,
  CandidateApplicationDraft,
  JobOpening
} from "../../src/client/App";

const emptyDraft: CandidateApplicationDraft = {
  candidateId: "",
  jobOpeningId: "",
  jobOpeningVersionId: "",
  source: "manual",
  note: "",
  finalizationReason: ""
};

const candidate: Candidate = {
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
  professionalLinks: []
};

const jobOpening: JobOpening = {
  id: "opening-1",
  code: "DEV-01",
  title: "Engenheiro de Software",
  status: "open",
  isPublic: true,
  publicSlug: "dev-01",
  applicationDeadline: null,
  isPubliclyAvailable: true,
  publishedVersion: {
    id: "version-1",
    publicTitle: "Engenheiro de Software Pleno",
    positionsCount: 1,
    salaryRange: null,
    internalInstructions: ""
  }
};

function makeApplication(overrides: Partial<CandidateApplication> = {}): CandidateApplication {
  return {
    id: "application-1",
    candidateId: candidate.id,
    jobOpeningId: jobOpening.id,
    applicationStatus: "active",
    currentStage: "screening",
    candidate: { id: candidate.id, fullName: candidate.fullName },
    ...overrides
  };
}

describe("SelectionPanel", () => {
  it("shows an empty state instead of an empty pipeline when there are no active applications", () => {
    render(
      <SelectionPanel
        canManage
        canHire
        applications={[]}
        candidates={[candidate]}
        jobOpenings={[jobOpening]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onMoveStage={vi.fn()}
        onFinalize={vi.fn()}
        onAddNote={vi.fn()}
      />
    );

    expect(screen.getByText("Nenhuma candidatura ativa")).toBeInTheDocument();
  });

  it("groups an active application under its real stage column", () => {
    render(
      <SelectionPanel
        canManage
        canHire
        applications={[makeApplication()]}
        candidates={[candidate]}
        jobOpenings={[jobOpening]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onMoveStage={vi.fn()}
        onFinalize={vi.fn()}
        onAddNote={vi.fn()}
      />
    );

    expect(screen.getByText("Triagem")).toBeInTheDocument();
    expect(
      screen.getByText("Maria Silva", { selector: ".ds-pipeline__card-title" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Engenheiro de Software", { selector: ".ds-pipeline__card-meta span" })
    ).toBeInTheDocument();
  });

  it("moves an application to the next/previous stage without inventing new stages", () => {
    const onMoveStage = vi.fn();
    render(
      <SelectionPanel
        canManage
        canHire
        applications={[makeApplication()]}
        candidates={[candidate]}
        jobOpenings={[jobOpening]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onMoveStage={onMoveStage}
        onFinalize={vi.fn()}
        onAddNote={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Avançar →" }));
    expect(onMoveStage).toHaveBeenCalledWith(makeApplication(), "interview");

    fireEvent.click(screen.getByRole("button", { name: "← Voltar" }));
    expect(onMoveStage).toHaveBeenCalledWith(makeApplication(), "applied");
  });

  it("only shows the hire action when the viewer is allowed to hire", () => {
    const { rerender } = render(
      <SelectionPanel
        canManage
        canHire={false}
        applications={[makeApplication()]}
        candidates={[candidate]}
        jobOpenings={[jobOpening]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onMoveStage={vi.fn()}
        onFinalize={vi.fn()}
        onAddNote={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Contratar" })).not.toBeInTheDocument();

    rerender(
      <SelectionPanel
        canManage
        canHire
        applications={[makeApplication()]}
        candidates={[candidate]}
        jobOpenings={[jobOpening]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onMoveStage={vi.fn()}
        onFinalize={vi.fn()}
        onAddNote={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Contratar" })).toBeInTheDocument();
  });

  it("lists finalized applications separately, without progression actions", () => {
    const hired = makeApplication({
      id: "application-2",
      applicationStatus: "hired",
      finalizationReason: "Aprovado em todas as etapas"
    });
    render(
      <SelectionPanel
        canManage
        canHire
        applications={[hired]}
        candidates={[candidate]}
        jobOpenings={[jobOpening]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        onCreate={vi.fn()}
        onMoveStage={vi.fn()}
        onFinalize={vi.fn()}
        onAddNote={vi.fn()}
      />
    );

    expect(screen.getByText("Nenhuma candidatura ativa")).toBeInTheDocument();
    expect(screen.getByText("Contratado(a)")).toBeInTheDocument();
    expect(screen.getByText(/Aprovado em todas as etapas/)).toBeInTheDocument();
  });
});
