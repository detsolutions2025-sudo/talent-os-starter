import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobProfilesPanel } from "../../src/client/features/job-profiles/JobProfilesPanel";
import type { JobProfile, JobProfileDraft, JobProfileVersion } from "../../src/client/App";

const emptyDraft: JobProfileDraft = { code: "", name: "" };

const profile: JobProfile = {
  id: "profile-1",
  code: "ENG-01",
  name: "Engenheiro Backend",
  status: "active"
};

const publishedVersion: JobProfileVersion = {
  id: "version-1",
  versionNumber: 2,
  status: "published",
  title: "Engenheiro Backend Sênior",
  mission: "",
  summary: "Responsável pela plataforma.",
  responsibilities: [],
  requirements: [],
  workModel: "remote",
  workSchedule: { weeklyHours: 40, description: "", shift: "" },
  travelRequirement: "none",
  salaryRange: { min: 8000, max: 12000, currency: "BRL", periodicity: "monthly" },
  competencies: [],
  discardedAt: null
};

function noop() {}

describe("JobProfilesPanel", () => {
  it("shows an empty state instead of fabricating job profiles", () => {
    render(
      <JobProfilesPanel
        canManage
        canPublish
        jobProfiles={[]}
        inactiveJobProfiles={[]}
        selectedJobProfileId=""
        onSelectJobProfile={noop}
        draft={emptyDraft}
        onDraftChange={noop}
        onCreate={noop}
        publishedJobVersion={null}
        jobDraftVersion={null}
        jobProfileHistory={[]}
        onCreateDraft={noop}
        onUpdateDraftField={noop}
        onSaveDraft={noop}
        onPublishDraft={noop}
        onDiscardDraft={noop}
      />
    );

    expect(screen.getByText("Nenhum cargo cadastrado")).toBeInTheDocument();
  });

  it("selects a job profile through the real row click and shows its published version", () => {
    const onSelectJobProfile = vi.fn();
    render(
      <JobProfilesPanel
        canManage
        canPublish
        jobProfiles={[profile]}
        inactiveJobProfiles={[]}
        selectedJobProfileId=""
        onSelectJobProfile={onSelectJobProfile}
        draft={emptyDraft}
        onDraftChange={noop}
        onCreate={noop}
        publishedJobVersion={publishedVersion}
        jobDraftVersion={null}
        jobProfileHistory={[]}
        onCreateDraft={noop}
        onUpdateDraftField={noop}
        onSaveDraft={noop}
        onPublishDraft={noop}
        onDiscardDraft={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Engenheiro Backend/ }));
    expect(onSelectJobProfile).toHaveBeenCalledWith("profile-1");

    expect(screen.getByText("Publicado v2")).toBeInTheDocument();
    expect(screen.getByText("Responsável pela plataforma.")).toBeInTheDocument();
  });

  it("only offers to create a draft when a profile is selected and has none yet", () => {
    const { rerender } = render(
      <JobProfilesPanel
        canManage
        canPublish
        jobProfiles={[profile]}
        inactiveJobProfiles={[]}
        selectedJobProfileId=""
        onSelectJobProfile={noop}
        draft={emptyDraft}
        onDraftChange={noop}
        onCreate={noop}
        publishedJobVersion={null}
        jobDraftVersion={null}
        jobProfileHistory={[]}
        onCreateDraft={noop}
        onUpdateDraftField={noop}
        onSaveDraft={noop}
        onPublishDraft={noop}
        onDiscardDraft={noop}
      />
    );
    expect(screen.queryByRole("button", { name: "Criar rascunho" })).not.toBeInTheDocument();

    rerender(
      <JobProfilesPanel
        canManage
        canPublish
        jobProfiles={[profile]}
        inactiveJobProfiles={[]}
        selectedJobProfileId="profile-1"
        onSelectJobProfile={noop}
        draft={emptyDraft}
        onDraftChange={noop}
        onCreate={noop}
        publishedJobVersion={null}
        jobDraftVersion={null}
        jobProfileHistory={[]}
        onCreateDraft={noop}
        onUpdateDraftField={noop}
        onSaveDraft={noop}
        onPublishDraft={noop}
        onDiscardDraft={noop}
      />
    );
    expect(screen.getByRole("button", { name: "Criar rascunho" })).toBeInTheDocument();
  });

  it("edits only the first responsibility, matching the preserved backend contract", () => {
    const onUpdateDraftField = vi.fn();
    const draftVersion: JobProfileVersion = { ...publishedVersion, status: "draft" };
    render(
      <JobProfilesPanel
        canManage
        canPublish
        jobProfiles={[profile]}
        inactiveJobProfiles={[]}
        selectedJobProfileId="profile-1"
        onSelectJobProfile={noop}
        draft={emptyDraft}
        onDraftChange={noop}
        onCreate={noop}
        publishedJobVersion={null}
        jobDraftVersion={draftVersion}
        jobProfileHistory={[]}
        onCreateDraft={noop}
        onUpdateDraftField={onUpdateDraftField}
        onSaveDraft={noop}
        onPublishDraft={noop}
        onDiscardDraft={noop}
      />
    );

    fireEvent.change(screen.getByLabelText("Responsabilidade principal"), {
      target: { value: "Manter a plataforma no ar" }
    });
    expect(onUpdateDraftField).toHaveBeenCalledWith("responsibilities", [
      { text: "Manter a plataforma no ar", displayOrder: 0 }
    ]);
  });
});
