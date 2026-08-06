import { useEffect, useRef, useState } from "react";
import { Loader2, Save, Image as ImageIcon, Info, Trash2, UploadCloud } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showSuccess, showError } from "@/utils/toast";
import { loadBrandLogo, saveBrandLogo, clearBrandLogo } from "@/services/settings";
import { useBranding } from "@/hooks/useBranding";
import { isSupabaseConfigured } from "@/services/supabase";

const MAX_BYTES = 1024 * 1024; // 1 MB
const ACCEPTED = ["image/png"];

/** Read a File into a base64 data URI. */
const fileToDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });

const AdminBranding = () => {
  const { setLogo } = useBranding();
  const [current, setCurrent] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // newly picked, not yet saved
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setCurrent(await loadBrandLogo());
      setLoading(false);
    })();
  }, []);

  const preview = pending ?? current;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      showError("Please upload a PNG image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      showError("Logo must be 1 MB or smaller.");
      return;
    }
    try {
      const dataUri = await fileToDataUri(file);
      setPending(dataUri);
      setFileName(file.name);
    } catch {
      showError("Could not read that file.");
    }
  };

  const onSave = async () => {
    if (!pending) return;
    setSaving(true);
    const res = await saveBrandLogo(pending);
    setSaving(false);
    if (!res.ok) {
      showError(res.error ?? "Failed to save logo");
      return;
    }
    setCurrent(pending);
    setPending(null);
    setFileName("");
    setLogo(pending); // update header/login/favicon immediately
    showSuccess("Logo updated");
  };

  const onRemove = async () => {
    setRemoving(true);
    const res = await clearBrandLogo();
    setRemoving(false);
    if (!res.ok) {
      showError(res.error ?? "Failed to remove logo");
      return;
    }
    setCurrent(null);
    setPending(null);
    setFileName("");
    setLogo(null); // revert to the built-in mark
    showSuccess("Reverted to the default logo");
  };

  return (
    <AdminShell>
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[12.5px] text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Upload a PNG logo to replace the Aerchain mark in the header, the login
            screen, and the browser tab. Transparent-background PNGs look best. It
            appears everywhere as soon as you save.
            {!isSupabaseConfigured && (
              <span className="mt-1 block font-medium">
                Demo mode: Supabase isn't configured, so the logo is saved to this
                browser only.
              </span>
            )}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
            <ImageIcon className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            <div>
              <h2 className="text-[14px] font-bold">Branding Logo</h2>
              <p className="text-[12px] text-muted-foreground">PNG · up to 1 MB</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="grid gap-6 p-5 md:grid-cols-2">
              {/* Preview */}
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-muted-foreground">Preview</p>
                <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-border/60 bg-secondary/20 p-6">
                  {preview ? (
                    <img
                      src={preview}
                      alt="Logo preview"
                      style={{ height: 48, width: "auto", maxWidth: "100%" }}
                    />
                  ) : (
                    <span className="text-[12px] text-muted-foreground">
                      Using the default Aerchain mark
                    </span>
                  )}
                </div>
                {/* Dark preview to check transparency/contrast */}
                <div className="flex min-h-[72px] items-center justify-center rounded-xl border border-border/60 bg-[#0F0F1A] p-4">
                  {preview ? (
                    <img
                      src={preview}
                      alt="Logo preview on dark"
                      style={{ height: 40, width: "auto", maxWidth: "100%" }}
                    />
                  ) : (
                    <span className="text-[11px] text-white/40">Dark background</span>
                  )}
                </div>
              </div>

              {/* Upload */}
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-medium text-muted-foreground">Upload</p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFile(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                    dragOver
                      ? "border-violet-400 bg-violet-500/[0.06]"
                      : "border-border/70 hover:border-violet-300 hover:bg-secondary/40"
                  )}
                >
                  <UploadCloud className="h-6 w-6 text-muted-foreground" />
                  <span className="text-[12.5px] font-semibold">
                    {fileName || "Click to choose, or drag a PNG here"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">PNG · max 1 MB</span>
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />

                <div className="flex flex-wrap gap-2">
                  <Button onClick={onSave} disabled={!pending || saving}>
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : <><Save className="mr-2 h-4 w-4" /> Save logo</>}
                  </Button>
                  {pending && (
                    <Button variant="outline" onClick={() => { setPending(null); setFileName(""); }} disabled={saving}>
                      Cancel
                    </Button>
                  )}
                  {current && !pending && (
                    <Button variant="outline" onClick={onRemove} disabled={removing} className="text-rose-600 hover:text-rose-700">
                      {removing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Removing…</> : <><Trash2 className="mr-2 h-4 w-4" /> Remove</>}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
};

export default AdminBranding;
