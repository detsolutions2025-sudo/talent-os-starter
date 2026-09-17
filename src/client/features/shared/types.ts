// Tipos repetidos, byte a byte, nos paineis de Onboarding, Offboarding, Employment e
// AccessGrant (Wave 3) -- movidos para ca apenas porque o TaskList compartilhado precisa
// deles. Nenhum tipo de dominio novo: o formato ja e o que cada endpoint sempre devolveu.
export type MembershipOption = {
  id: string;
  role: "owner" | "admin" | "member";
  status: "active" | "inactive";
  user?: { name: string; email: string } | null;
};

// Onboarding e Offboarding tasks tem exatamente o mesmo formato (mesmos campos, mesmos
// estados) -- e o que permite o TaskList ser compartilhado sem forcar abstracao.
export type LifecycleTaskView = {
  id: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  status: "open" | "completed" | "cancelled";
  assigneeMembershipId: string | null;
  dueAt: string | null;
  cancellationReason: string | null;
};
