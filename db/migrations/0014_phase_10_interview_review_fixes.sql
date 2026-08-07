-- Fase 10 - correcoes da revisao final de Entrevistas.
--
-- Migration 0013 ja foi aplicada em ambiente compartilhado com o conteudo original. Esta
-- migration adiciona, de forma isolada e reproduzivel, a protecao que faltava para
-- `interview_participants`: as demais tabelas operacionais da entrevista (`interview_responses`
-- e `interview_evaluations`) ja usavam o trigger `prevent_completed_interview_operational_mutation`
-- (criado em 0013) para bloquear UPDATE quando a entrevista esta em estado final
-- (`completed`, `cancelled` ou `no_show`), mas `interview_participants` -- que tambem sofre
-- UPDATE (troca de papel, inativacao de participante) -- ficava sem essa mesma trava no banco,
-- dependendo apenas da checagem em nivel de aplicacao.
--
-- A funcao `prevent_completed_interview_operational_mutation` ja existe (criada em 0013) e nao e
-- redefinida aqui para evitar duplicar objetos ja existentes.

DROP TRIGGER IF EXISTS trg_interview_participant_final_immutable ON interview_participants;
CREATE TRIGGER trg_interview_participant_final_immutable
BEFORE UPDATE ON interview_participants
FOR EACH ROW EXECUTE FUNCTION prevent_completed_interview_operational_mutation();
