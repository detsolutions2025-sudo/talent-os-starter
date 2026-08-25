import { useState } from "react";

// Fase 29 (ADR-0026; SPEC-028 v1.0 s25/s38). Painel administrativo minimo, mesmo padrao de
// `AccessGrantPanel.tsx`: owner pode convidar member/admin; admin so pode convidar member
// (SPEC-028 s25, espelha exatamente SPEC-004). Nenhum autosservico da pessoa convidada nesta UI
// -- apenas criacao/listagem/cancelamento pelo lado de quem convida.
type InvitationView = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "pending" | "accepted" | "expired" | "cancelled";
  createdAt: string;
};

export function InvitationPanel({
  organizationId,
  role,
  headers
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
}) {
  const canInvite = role === "owner" || role === "admin";
  const [invitations, setInvitations] = useState<InvitationView[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [message, setMessage] = useState("");

  async function loadInvitations() {
    const response = await fetch(`/api/organizations/${organizationId}/invitations`, { headers });
    if (response.ok) {
      setInvitations(await response.json());
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`/api/organizations/${organizationId}/invitations`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({ email, role: inviteRole })
    });
    if (response.ok) {
      setEmail("");
      setMessage("Convite enviado.");
      await loadInvitations();
    } else {
      const body = await response.json().catch(() => null);
      setMessage(body?.error?.message ?? "Nao foi possivel enviar o convite.");
    }
  }

  async function handleCancel(invitationId: string) {
    const response = await fetch(
      `/api/organizations/${organizationId}/invitations/${invitationId}/cancel`,
      { method: "POST", headers }
    );
    if (response.ok) {
      await loadInvitations();
    }
  }

  if (!canInvite) {
    return null;
  }

  return (
    <div className="panel invitations">
      <span>Convites</span>
      <form onSubmit={handleInvite} className="invitation-form">
        <input
          type="email"
          aria-label="E-mail do convidado"
          placeholder="E-mail"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <select
          aria-label="Role do convite"
          value={inviteRole}
          onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}
        >
          <option value="member">member</option>
          {role === "owner" && <option value="admin">admin</option>}
        </select>
        <button type="submit">Convidar</button>
        <button type="button" onClick={loadInvitations}>
          Atualizar lista
        </button>
      </form>
      {message && <p className="invitation-message">{message}</p>}
      <ul>
        {invitations.map((invitation) => (
          <li key={invitation.id}>
            {invitation.email} - {invitation.role} - {invitation.status}
            {invitation.status === "pending" && (
              <button type="button" onClick={() => handleCancel(invitation.id)}>
                Cancelar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
