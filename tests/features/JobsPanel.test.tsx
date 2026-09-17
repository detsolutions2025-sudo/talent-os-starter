import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobsPanel } from "../../src/client/features/jobs/JobsPanel";
import type { JobOpening, JobOpeningDraft } from "../../src/client/App";

const emptyDraft: JobOpeningDraft = {
  code: "",
  title: "",
  publicTitle: "",
  positionsCount: 1,
  publicSlug: "",
  applicationDeadline: "",
  showSalary: false
};

const draftOpening: JobOpening = {
  id: "opening-1",
  code: "DEV-01",
  title: "Engenheiro de Software",
  status: "draft",
  isPublic: false,
  publicSlug: null,
  applicationDeadline: null,
  isPubliclyAvailable: false,
  publishedVersion: null
};

const openOpening: JobOpening = {
  id: "opening-2",
  code: "DEV-02",
  title: "Analista de Dados",
  status: "open",
  isPublic: true,
  publicSlug: "analista-dados",
  applicationDeadline: null,
  isPubliclyAvailable: true,
  publishedVersion: {
    id: "version-1",
    publicTitle: "Analista de Dados Pleno",
    positionsCount: 2,
    salaryRange: null,
    internalInstructions: ""
  }
};

describe("JobsPanel", () => {
  it("shows an empty state instead of fabricating data when there are no job openings", () => {
    render(
      <JobsPanel
        canManage
        canPublishOpenings
        jobOpenings={[]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        publishedJobVersionAvailable
        onCreate={vi.fn()}
        onPublishAndOpen={vi.fn()}
        onPublishPublicly={vi.fn()}
      />
    );

    expect(screen.getByText("Nenhuma vaga cadastrada")).toBeInTheDocument();
  });

  it("renders real job openings with status and metadata", () => {
    render(
      <JobsPanel
        canManage
        canPublishOpenings
        jobOpenings={[draftOpening, openOpening]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        publishedJobVersionAvailable
        onCreate={vi.fn()}
        onPublishAndOpen={vi.fn()}
        onPublishPublicly={vi.fn()}
      />
    );

    expect(screen.getByText("Engenheiro de Software")).toBeInTheDocument();
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
    expect(screen.getByText("Analista de Dados")).toBeInTheDocument();
    expect(screen.getByText("Aberta")).toBeInTheDocument();
    expect(screen.getByText(/Analista de Dados Pleno/)).toBeInTheDocument();
  });

  it("shows the right action per status and calls the matching handler", () => {
    const onPublishAndOpen = vi.fn();
    const onPublishPublicly = vi.fn();
    render(
      <JobsPanel
        canManage
        canPublishOpenings
        jobOpenings={[draftOpening, openOpening]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        publishedJobVersionAvailable
        onCreate={vi.fn()}
        onPublishAndOpen={onPublishAndOpen}
        onPublishPublicly={onPublishPublicly}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Publicar e abrir" }));
    expect(onPublishAndOpen).toHaveBeenCalledWith(draftOpening);

    fireEvent.click(screen.getByRole("button", { name: "Divulgar" }));
    expect(onPublishPublicly).toHaveBeenCalledWith(openOpening);
  });

  it("disables creating a new job opening until a job profile version is published", () => {
    const onDraftChange = vi.fn();
    const { rerender } = render(
      <JobsPanel
        canManage
        canPublishOpenings
        jobOpenings={[]}
        draft={emptyDraft}
        onDraftChange={onDraftChange}
        publishedJobVersionAvailable={false}
        onCreate={vi.fn()}
        onPublishAndOpen={vi.fn()}
        onPublishPublicly={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Criar vaga" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "DEV-03" } });
    expect(onDraftChange).toHaveBeenCalledWith({ code: "DEV-03" });

    rerender(
      <JobsPanel
        canManage
        canPublishOpenings
        jobOpenings={[]}
        draft={emptyDraft}
        onDraftChange={onDraftChange}
        publishedJobVersionAvailable
        onCreate={vi.fn()}
        onPublishAndOpen={vi.fn()}
        onPublishPublicly={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Criar vaga" })).toBeEnabled();
  });

  it("hides the creation forms when the viewer cannot manage job openings", () => {
    render(
      <JobsPanel
        canManage={false}
        canPublishOpenings={false}
        jobOpenings={[openOpening]}
        draft={emptyDraft}
        onDraftChange={vi.fn()}
        publishedJobVersionAvailable
        onCreate={vi.fn()}
        onPublishAndOpen={vi.fn()}
        onPublishPublicly={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Criar vaga" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Divulgar" })).not.toBeInTheDocument();
  });
});
