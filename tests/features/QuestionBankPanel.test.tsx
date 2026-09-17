import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionBankPanel } from "../../src/client/features/question-bank/QuestionBankPanel";
import type { QuestionDraft } from "../../src/client/App";

const emptyDraft: QuestionDraft = {
  code: "",
  title: "",
  questionText: "",
  type: "open_text",
  category: "general",
  competencyCatalogItemId: ""
};

function noop() {}

describe("QuestionBankPanel", () => {
  it("only offers the organization/global tabs when the viewer can manage questions", () => {
    render(
      <QuestionBankPanel
        canManage={false}
        activeTab="catalog"
        onTabChange={noop}
        questionCatalogItems={[]}
        competencyCatalogItems={[]}
        organizationQuestions={[]}
        organizationDraft={emptyDraft}
        onOrganizationDraftChange={noop}
        onCreateOrganization={noop}
        onChangeOrganizationStatus={noop}
        globalQuestions={[]}
        availableGlobalQuestions={[]}
        onAdoptGlobal={noop}
      />
    );

    expect(screen.getByRole("tab", { name: "Catálogo Utilizado" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Perguntas da Empresa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Biblioteca Global" })).not.toBeInTheDocument();
  });

  it("renders the real relation to the competency catalog in the new-question form", () => {
    render(
      <QuestionBankPanel
        canManage
        activeTab="organization"
        onTabChange={noop}
        questionCatalogItems={[]}
        competencyCatalogItems={[
          {
            competencyCatalogItemId: "comp-1",
            origin: "organization",
            code: "COM-01",
            name: "Comunicação",
            category: "behavioral",
            status: "active",
            sourceStatus: "active",
            globalStatus: null,
            editable: true,
            deprecated: false
          }
        ]}
        organizationQuestions={[]}
        organizationDraft={emptyDraft}
        onOrganizationDraftChange={noop}
        onCreateOrganization={noop}
        onChangeOrganizationStatus={noop}
        globalQuestions={[]}
        availableGlobalQuestions={[]}
        onAdoptGlobal={noop}
      />
    );

    const select = screen.getByLabelText("Competência associada") as HTMLSelectElement;
    const options = Array.from(select.options).map((option) => option.textContent);
    expect(options).toContain("Comunicação");
  });

  it("does not offer a global-question creation form (no such backend action exists)", () => {
    render(
      <QuestionBankPanel
        canManage
        activeTab="global"
        onTabChange={noop}
        questionCatalogItems={[]}
        competencyCatalogItems={[]}
        organizationQuestions={[]}
        organizationDraft={emptyDraft}
        onOrganizationDraftChange={noop}
        onCreateOrganization={noop}
        onChangeOrganizationStatus={noop}
        globalQuestions={[]}
        availableGlobalQuestions={[]}
        onAdoptGlobal={noop}
      />
    );

    expect(screen.queryByRole("button", { name: /Criar global/ })).not.toBeInTheDocument();
  });

  it("toggles organization question status with the real activate/inactivate action", () => {
    const onChangeOrganizationStatus = vi.fn();
    render(
      <QuestionBankPanel
        canManage
        activeTab="organization"
        onTabChange={noop}
        questionCatalogItems={[]}
        competencyCatalogItems={[]}
        organizationQuestions={[
          {
            id: "q-1",
            code: "Q-01",
            title: "Descreva um desafio técnico",
            questionText: "",
            type: "open_text",
            category: "technical",
            competencyCatalogItemId: null,
            status: "active"
          }
        ]}
        organizationDraft={emptyDraft}
        onOrganizationDraftChange={noop}
        onCreateOrganization={noop}
        onChangeOrganizationStatus={onChangeOrganizationStatus}
        globalQuestions={[]}
        availableGlobalQuestions={[]}
        onAdoptGlobal={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Inativar" }));
    expect(onChangeOrganizationStatus).toHaveBeenCalledWith("q-1", "inactivate");
  });

  it("allows adopting an available global question", () => {
    const onAdoptGlobal = vi.fn();
    render(
      <QuestionBankPanel
        canManage
        activeTab="global"
        onTabChange={noop}
        questionCatalogItems={[]}
        competencyCatalogItems={[]}
        organizationQuestions={[]}
        organizationDraft={emptyDraft}
        onOrganizationDraftChange={noop}
        onCreateOrganization={noop}
        onChangeOrganizationStatus={noop}
        globalQuestions={[]}
        availableGlobalQuestions={[
          {
            id: "gq-1",
            code: "GQ-01",
            title: "Como você lida com prazos apertados?",
            questionText: "",
            type: "situational",
            category: "situational",
            status: "active"
          }
        ]}
        onAdoptGlobal={onAdoptGlobal}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Adotar" }));
    expect(onAdoptGlobal).toHaveBeenCalledWith("gq-1");
  });
});
