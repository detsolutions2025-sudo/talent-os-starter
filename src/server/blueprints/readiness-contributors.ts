import type { BlueprintReadinessContributor } from "./types";

// Feature Readiness (SPEC-018 secao 7/9; Plano Tecnico Revisado, itens 12/15): Features
// futuras (Portal Publico, Pre-Entrevista, etc.) podem declarar pre-requisitos proprios de
// readiness registrando um `BlueprintReadinessContributor` aqui, sem alterar os criterios
// minimos gerais definidos por blueprints/readiness.ts nem o mecanismo basico de ativacao.
//
// Nesta Fase (15) nenhuma Feature futura foi implementada -- Portal Publico, Candidatura
// Publica, Pre-Entrevista, Perfil Comportamental, DISC, Pre-Analise Assistida por IA e Dossie
// Inteligente estao fora do escopo desta SPEC (SPEC-018 secao 2). O array fica
// deliberadamente vazio: nenhum runtime plugin system, discovery dinamica ou registry
// complexo e criado -- apenas checks centrais existem nesta fase, exatamente como pedido.
export const readinessContributors: BlueprintReadinessContributor[] = [];
