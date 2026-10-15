import { useEffect, useState } from "react";
import type {
  AccessUser,
  InvitationInfo,
  InvitationResult,
  Role,
  SessionInfo,
} from "../../src/admin/types";
import { api, errorText } from "./api";

export function Profile({ session }: { session: SessionInfo }) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function action(run: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await run();
      setNotice(success);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page-content narrow">
      <p className="eyebrow">Dein Zugang</p>
      <h1>{session.user.name}</h1>
      <p className="page-intro">
        {session.user.role === "admin" ? "Admin" : "Content Manager"} · Deine Passkeys bleiben auf
        deinen Geräten beziehungsweise in deinem Passwortmanager.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="section-heading">
        <h2>Deine Passkeys</h2>
      </div>
      <div className="plain-list">
        {session.passkeys.map((passkey) => (
          <div className="plain-row" key={passkey.id}>
            <div>
              <strong>{passkey.label || "Passkey"}</strong>
              <small>
                Hinzugefügt am {new Date(passkey.createdAt).toLocaleDateString("de-DE")}
              </small>
            </div>
            <button
              className="text-button danger-text"
              disabled={busy || session.passkeys.length < 2}
              onClick={() => {
                if (window.confirm(`Passkey „${passkey.label || "Passkey"}“ entfernen?`))
                  void action(async () => {
                    await api.request(`/passkeys/${encodeURIComponent(passkey.id)}`, {
                      method: "DELETE",
                    });
                    api.setSession(await api.request<SessionInfo>("/me"));
                  }, "Passkey entfernt.");
              }}
            >
              Entfernen
            </button>
          </div>
        ))}
      </div>
      <p className="hint">
        Behalte mindestens einen Passkey. Ein zusätzlicher Passkey hilft, wenn ein Gerät verloren
        geht.
      </p>
      <form
        className="compact-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action(async () => {
            await api.addPasskey(label.trim() || "Weiterer Passkey");
            setLabel("");
          }, "Der zusätzliche Passkey ist eingerichtet.");
        }}
      >
        <label>
          Bezeichnung <span className="subtle">optional</span>
          <input
            value={label}
            maxLength={80}
            placeholder="Zum Beispiel: Mein Laptop"
            disabled={busy}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </label>
        <button className="button" disabled={busy}>
          {busy ? "Bitte bestätigen …" : "+ Passkey hinzufügen"}
        </button>
      </form>
      <button
        className="text-button"
        disabled={busy}
        onClick={() =>
          void action(async () => {
            await api.post("/logout");
            api.setSession(null);
          }, "")
        }
      >
        Abmelden
      </button>
    </section>
  );
}

export function Access({ session }: { session: SessionInfo }) {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [invitations, setInvitations] = useState<InvitationInfo[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("content-manager");
  const [link, setLink] = useState<InvitationResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [updatedName, setUpdatedName] = useState("");
  async function load() {
    const result = await api.request<{ users: AccessUser[]; invitations: InvitationInfo[] }>(
      "/access",
    );
    setUsers(result.users);
    setInvitations(result.invitations);
  }
  useEffect(() => {
    void load()
      .catch((cause) => setError(errorText(cause)))
      .finally(() => setLoading(false));
  }, []);
  async function action(run: () => Promise<void>, success = "Änderung gespeichert.") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await run();
      await load();
      setNotice(success);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  const adminCount = users.filter((user) => user.role === "admin" && user.active).length;
  return (
    <section className="page-content">
      <p className="eyebrow">Gemeinsam pflegen</p>
      <h1>Zugänge</h1>
      <p className="page-intro">
        Person einladen, Link persönlich weitergeben, Passkey einrichten lassen. Eine E-Mail-Adresse
        ist nicht nötig.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <form
        className="invitation-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action(async () => {
            setLink(await api.post<InvitationResult>("/invitations", { name: name.trim(), role }));
            setName("");
            setRole("content-manager");
          }, "Einrichtungslink erstellt.");
        }}
      >
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            maxLength={100}
            autoComplete="off"
            disabled={busy}
            placeholder="Vor- und Nachname"
          />
        </label>
        <label>
          Rolle
          <select
            value={role}
            onChange={(event) => setRole(event.currentTarget.value as Role)}
            disabled={busy}
          >
            <option value="content-manager">Content Manager</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button className="button" disabled={busy || !name.trim()}>
          Einrichtungslink erstellen
        </button>
      </form>
      <p className="hint">
        Content Manager bearbeiten Inhalte und Medien. Admins verwalten zusätzlich Zugänge und
        Spendenkontodaten.
      </p>
      {link && (
        <div className="invitation-result" role="status">
          <h2>Einrichtungslink für {link.name}</h2>
          <p>
            Einmal verwendbar bis {new Date(link.expiresAt).toLocaleString("de-DE")}. Gib diesen
            Link nur an die vorgesehene Person weiter.
          </p>
          <label className="visually-hidden" htmlFor="invite-url">
            Einrichtungslink
          </label>
          <input
            id="invite-url"
            readOnly
            value={link.url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link.url);
                setNotice("Link kopiert.");
              } catch {
                setNotice("Bitte markiere den Link und kopiere ihn.");
              }
            }}
          >
            Link kopieren
          </button>
        </div>
      )}
      <h2>Personen</h2>
      {loading ? (
        <p role="status">Zugänge werden geladen …</p>
      ) : (
        <div className="plain-list">
          {users.map((user) => {
            const lastAdmin = user.role === "admin" && user.active && adminCount < 2;
            return (
              <article className={`access-row${!user.active ? " inactive" : ""}`} key={user.id}>
                <div>
                  <strong>
                    {user.name}
                    {user.id === session.user.id ? " (du)" : ""}
                  </strong>
                  <small>
                    {user.active
                      ? `${user.passkeyCount} Passkey${user.passkeyCount === 1 ? "" : "s"}`
                      : "Deaktiviert"}
                    {user.lastLoginAt
                      ? ` · Zuletzt ${new Date(user.lastLoginAt).toLocaleDateString("de-DE")}`
                      : ""}
                  </small>
                </div>
                <label className="role-control">
                  <span className="visually-hidden">Rolle von {user.name}</span>
                  <select
                    disabled={busy || lastAdmin}
                    value={user.role}
                    onChange={(event) => {
                      const selectedRole = event.currentTarget.value;
                      if (
                        window.confirm(
                          `Rolle von ${user.name} auf ${selectedRole === "admin" ? "Admin" : "Content Manager"} ändern?`,
                        )
                      )
                        void action(async () => {
                          await api.request(`/access/${encodeURIComponent(user.id)}`, {
                            method: "PATCH",
                            body: JSON.stringify({ role: selectedRole }),
                          });
                          if (user.id === session.user.id)
                            api.setSession(await api.request<SessionInfo>("/me"));
                        });
                    }}
                  >
                    <option value="content-manager">Content Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <div className="access-actions">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setEditingName(user.id);
                      setUpdatedName(user.name);
                    }}
                  >
                    Name ändern
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || !user.active || user.id === session.user.id}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Zugang für ${user.name} wiederherstellen? Alle bisherigen Passkeys und Sitzungen werden gesperrt.`,
                        )
                      )
                        void action(
                          async () =>
                            setLink(
                              await api.post<InvitationResult>(
                                `/access/${encodeURIComponent(user.id)}/reset`,
                              ),
                            ),
                          "Neuen Einrichtungslink persönlich weitergeben.",
                        );
                    }}
                  >
                    Passkeys ersetzen
                  </button>
                  <button
                    className="text-button danger-text"
                    disabled={busy || lastAdmin}
                    onClick={() => {
                      if (
                        window.confirm(
                          `${user.name} ${user.active ? "deaktivieren? Alle Sitzungen werden beendet." : "wieder aktivieren?"}`,
                        )
                      )
                        void action(async () => {
                          await api.request(`/access/${encodeURIComponent(user.id)}`, {
                            method: "PATCH",
                            body: JSON.stringify({ active: !user.active }),
                          });
                        });
                    }}
                  >
                    {user.active ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </div>
                {editingName === user.id && (
                  <form
                    className="rename-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void action(async () => {
                        await api.request(`/access/${encodeURIComponent(user.id)}`, {
                          method: "PATCH",
                          body: JSON.stringify({ name: updatedName.trim() }),
                        });
                        if (user.id === session.user.id)
                          api.setSession(await api.request<SessionInfo>("/me"));
                        setEditingName(null);
                      });
                    }}
                  >
                    <label>
                      Name
                      <input
                        value={updatedName}
                        required
                        maxLength={100}
                        onChange={(event) => setUpdatedName(event.currentTarget.value)}
                        disabled={busy}
                      />
                    </label>
                    <button className="button secondary" disabled={busy || !updatedName.trim()}>
                      Speichern
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setEditingName(null)}
                    >
                      Abbrechen
                    </button>
                  </form>
                )}
                {lastAdmin && (
                  <small className="hint">Mindestens ein aktiver Admin bleibt erhalten.</small>
                )}
              </article>
            );
          })}
        </div>
      )}
      {invitations.length > 0 && (
        <>
          <h2>Offene Einladungen</h2>
          <div className="plain-list">
            {invitations.map((invitation) => (
              <div className="plain-row" key={invitation.id}>
                <div>
                  <strong>{invitation.name}</strong>
                  <small>Gültig bis {new Date(invitation.expiresAt).toLocaleString("de-DE")}</small>
                </div>
                <button
                  className="text-button danger-text"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api.request(`/invitations/${encodeURIComponent(invitation.id)}`, {
                        method: "DELETE",
                      });
                      if (link?.id === invitation.id) setLink(null);
                    }, "Einladung widerrufen.")
                  }
                >
                  Widerrufen
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
