import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DnaPanel } from "../../src/client/features/organizational-dna/DnaPanel";
import type { DnaVersion } from "../../src/client/App";

const draft: DnaVersion = {
  id: "draft-1",
  versionNumber: null,
  status: "draft",
  mission: "Missão em construção",
  vision: "",
  purpose: "",
  values: [
    {
      name: "Ética",
      description: "",
      practicalMeaning: "",
      expectedBehaviors: [],
      incompatibleBehaviors: []
    }
  ],
  competencies: [],
  culture: "",
  leadershipStyle: "",
  workEnvironment: "",
  discardedAt: null
};

const published: DnaVersion = {
  ...draft,
  id: "published-1",
  versionNumber: 3,
  status: "published"
};

function noop() {}

describe("DnaPanel", () => {
  it("shows real published status instead of a fabricated summary", () => {
    render(
      <DnaPanel
        canManage={false}
        canPublish={false}
        publishedDna={published}
        draftDna={null}
        history={[]}
        onCreateDraft={noop}
        onUpdateField={noop}
        onUpdateFirstValue={noop}
        onUpdateFirstCompetency={noop}
        onSave={noop}
        onPublish={noop}
        onDiscard={noop}
      />
    );

    expect(screen.getByText("Publicado v3")).toBeInTheDocument();
    expect(screen.getByText("Missão em construção")).toBeInTheDocument();
  });

  it("shows an empty state instead of a fake version when nothing is published", () => {
    render(
      <DnaPanel
        canManage={false}
        canPublish={false}
        publishedDna={null}
        draftDna={null}
        history={[]}
        onCreateDraft={noop}
        onUpdateField={noop}
        onUpdateFirstValue={noop}
        onUpdateFirstCompetency={noop}
        onSave={noop}
        onPublish={noop}
        onDiscard={noop}
      />
    );

    expect(screen.getByText("Sem versão publicada")).toBeInTheDocument();
  });

  it("edits only the first value/competency, matching the preserved backend contract", () => {
    const onUpdateFirstValue = vi.fn();
    render(
      <DnaPanel
        canManage
        canPublish
        publishedDna={null}
        draftDna={draft}
        history={[]}
        onCreateDraft={noop}
        onUpdateField={noop}
        onUpdateFirstValue={onUpdateFirstValue}
        onUpdateFirstCompetency={noop}
        onSave={noop}
        onPublish={noop}
        onDiscard={noop}
      />
    );

    expect(screen.getByLabelText("Nome do valor")).toHaveValue("Ética");
    fireEvent.change(screen.getByLabelText("Nome do valor"), { target: { value: "Ética 2" } });
    expect(onUpdateFirstValue).toHaveBeenCalledWith("name", "Ética 2");
  });

  it("shows Publicar only when the viewer can publish", () => {
    const { rerender } = render(
      <DnaPanel
        canManage
        canPublish={false}
        publishedDna={null}
        draftDna={draft}
        history={[]}
        onCreateDraft={noop}
        onUpdateField={noop}
        onUpdateFirstValue={noop}
        onUpdateFirstCompetency={noop}
        onSave={noop}
        onPublish={noop}
        onDiscard={noop}
      />
    );
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();

    rerender(
      <DnaPanel
        canManage
        canPublish
        publishedDna={null}
        draftDna={draft}
        history={[]}
        onCreateDraft={noop}
        onUpdateField={noop}
        onUpdateFirstValue={noop}
        onUpdateFirstCompetency={noop}
        onSave={noop}
        onPublish={noop}
        onDiscard={noop}
      />
    );
    expect(screen.getByRole("button", { name: "Publicar" })).toBeInTheDocument();
  });

  it("calls onCreateDraft only when there is no draft yet", () => {
    const onCreateDraft = vi.fn();
    render(
      <DnaPanel
        canManage
        canPublish={false}
        publishedDna={null}
        draftDna={null}
        history={[]}
        onCreateDraft={onCreateDraft}
        onUpdateField={noop}
        onUpdateFirstValue={noop}
        onUpdateFirstCompetency={noop}
        onSave={noop}
        onPublish={noop}
        onDiscard={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Criar rascunho" }));
    expect(onCreateDraft).toHaveBeenCalledTimes(1);
  });
});
