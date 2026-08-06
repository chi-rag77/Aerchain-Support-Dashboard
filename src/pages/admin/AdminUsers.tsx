import { useEffect, useState } from "react";
import {
  UserPlus, Loader2, Trash2, KeyRound, ShieldCheck, ShieldOff, Ban, CheckCircle2,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/tickets";
import { useAuth } from "@/auth/AuthProvider";
import { showSuccess, showError } from "@/utils/toast";
import {
  ManagedUser, listUsers, createUser, setUserAdmin, setUserDisabled, resetUserPassword, deleteUser,
} from "@/services/adminUsers";

const AdminUsers = () => {
  const { profile } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // create form
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", is_admin: false });
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const res = await listUsers();
    if (res.ok) setUsers(res.data ?? []);
    else showError(res.error ?? "Failed to load users");
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const onCreate = async () => {
    if (!form.email || form.password.length < 8) {
      showError("Email and a password of at least 8 characters are required.");
      return;
    }
    setCreating(true);
    const res = await createUser(form);
    setCreating(false);
    if (res.ok) {
      showSuccess(`User ${form.email} created`);
      setOpen(false);
      setForm({ email: "", full_name: "", password: "", is_admin: false });
      refresh();
    } else showError(res.error ?? "Failed to create user");
  };

  const wrap = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusyId(id);
    const res = await fn();
    setBusyId(null);
    if (res.ok) { showSuccess(okMsg); refresh(); }
    else showError(res.error ?? "Action failed");
  };

  const onResetPassword = async (u: ManagedUser) => {
    const pw = window.prompt(`Set a new password for ${u.email} (min 8 characters):`);
    if (!pw) return;
    if (pw.length < 8) { showError("Password must be at least 8 characters."); return; }
    wrap(u.id, () => resetUserPassword(u.id, pw), "Password updated");
  };

  return (
    <AdminShell>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border/60 bg-secondary/20 px-5 py-4">
          <div>
            <h2 className="text-[14px] font-bold">Users</h2>
            <p className="text-[12px] text-muted-foreground">{users.length} {users.length === 1 ? "account" : "accounts"} with access</p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="mr-2 h-4 w-4" /> Add user</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a new user</DialogTitle>
                <DialogDescription>They'll sign in with this email and password. Share credentials securely.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nu-email">Email</Label>
                  <Input id="nu-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="person@aerchain.io" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nu-name">Full name</Label>
                  <Input id="nu-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nu-pw">Temporary password</Label>
                  <Input id="nu-pw" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min 8 characters" />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <div className="text-[13px] font-semibold">System administrator</div>
                    <div className="text-[11.5px] text-muted-foreground">Can manage users, SLA rules and logs</div>
                  </div>
                  <Switch checked={form.is_admin} onCheckedChange={(v) => setForm({ ...form, is_admin: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={onCreate} disabled={creating}>
                  {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</> : "Create user"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {users.map((u) => {
              const self = u.id === profile?.id;
              const busy = busyId === u.id;
              return (
                <div key={u.id} className={cn("flex flex-wrap items-center gap-4 px-5 py-3.5", u.disabled && "opacity-60")}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6B4EFF] text-[11px] font-bold text-white">
                    {initials(u.full_name || u.email)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold">{u.full_name || u.email}</span>
                      {u.is_admin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                          <ShieldCheck className="h-3 w-3" /> Admin
                        </span>
                      )}
                      {u.disabled && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                          Disabled
                        </span>
                      )}
                      {self && <span className="text-[10.5px] text-muted-foreground">(you)</span>}
                    </div>
                    <div className="truncate text-[12px] text-muted-foreground">{u.email}</div>
                  </div>

                  {/* Admin toggle */}
                  <div className="flex items-center gap-2">
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">Admin</span>
                    <Switch
                      checked={u.is_admin}
                      disabled={busy || self}
                      onCheckedChange={(v) => wrap(u.id, () => setUserAdmin(u.id, v), v ? "Granted admin" : "Removed admin")}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset password" disabled={busy} onClick={() => onResetPassword(u)}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      title={u.disabled ? "Enable" : "Disable"} disabled={busy || self}
                      onClick={() => wrap(u.id, () => setUserDisabled(u.id, !u.disabled), u.disabled ? "User enabled" : "User disabled")}
                    >
                      {u.disabled ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Ban className="h-4 w-4" />}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-700" title="Delete" disabled={busy || self}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {u.email}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes the account and revokes access. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-rose-600 hover:bg-rose-700"
                            onClick={() => wrap(u.id, () => deleteUser(u.id), "User deleted")}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
            {users.length === 0 && (
              <div className="flex flex-col items-center gap-1 py-16 text-center">
                <ShieldOff className="h-6 w-6 text-muted-foreground" />
                <p className="text-[13px] text-muted-foreground">No users yet. Add your first user above.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
};

export default AdminUsers;
