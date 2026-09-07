import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Smartphone, Upload, Save, Loader2, FileCheck2, Trash2, Link2, Apple } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function MobileAppSettings() {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    android_path: "",
    ios_path: "",
    app_version: "",
    version_description: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const apps = await base44.entities.MobileApp.list("-updated_date", 1);
      const app = apps && apps.length > 0 ? apps[0] : null;
      setRecord(app);
      if (app) {
        setForm({
          android_path: app.android_path || "",
          ios_path: app.ios_path || "",
          app_version: app.app_version || "",
          version_description: app.version_description || "",
        });
      }
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleUploadApk(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".apk")) {
      toast({ title: "Invalid file", description: "Please select an .apk file", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("file_name", file.name);
      formData.append("mime_type", "application/vnd.android.package-archive");
      const token = localStorage.getItem("base44_access_token");
      const resp = await fetch("/api/functions/apiMobileApp?action=upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || "Upload failed");
      set("android_path", data.file_url);
      toast({ title: "APK uploaded", description: "Download link saved to the form. Click Save to persist." });
    } catch (err) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!form.app_version.trim()) {
      toast({ title: "Version required", description: "Enter an app version (e.g. 1.0.1)", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        android_path: form.android_path || "",
        ios_path: form.ios_path || "",
        app_version: form.app_version.trim(),
        version_description: form.version_description || "",
      };
      if (record?.id) {
        await base44.entities.MobileApp.update(record.id, payload);
      } else {
        const created = await base44.entities.MobileApp.create(payload);
        setRecord(created);
      }
      toast({ title: "Saved", description: "Mobile app configuration updated." });
    } catch (err) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Smartphone className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mobile App Distribution</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Upload APK / IPA builds and manage version info for OTA updates</p>
        </div>
      </motion.div>

      {/* Android APK */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
            <FileCheck2 className="w-4 h-4" />
          </div>
          <h2 className="text-base font-semibold">Android APK</h2>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".apk,application/vnd.android.package-archive"
          className="hidden"
          onChange={handleUploadApk}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Uploading..." : "Upload APK File"}
        </Button>

        <div className="space-y-1.5">
          <Label>Android Download Path</Label>
          <div className="flex gap-2">
            <Input
              value={form.android_path}
              onChange={e => set("android_path", e.target.value)}
              placeholder="https://...apk URL (auto-filled on upload, or paste manually)"
            />
            {form.android_path && (
              <Button type="button" variant="ghost" size="icon" onClick={() => set("android_path", "")} title="Clear">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            The mobile app checks this path on startup and prompts the user to download &amp; install when a new version is detected.
          </p>
        </div>
      </motion.div>

      {/* iOS */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
            <Apple className="w-4 h-4" />
          </div>
          <h2 className="text-base font-semibold">iOS</h2>
        </div>
        <div className="space-y-1.5">
          <Label>iOS Path / TestFlight URL</Label>
          <Input
            value={form.ios_path}
            onChange={e => set("ios_path", e.target.value)}
            placeholder="https://testflight.apple.com/..."
          />
        </div>
      </motion.div>

      {/* Version info */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Link2 className="w-4 h-4" />
          </div>
          <h2 className="text-base font-semibold">Version Information</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>App Version</Label>
            <Input
              value={form.app_version}
              onChange={e => set("app_version", e.target.value)}
              placeholder="1.0.1"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Version Description / Release Notes</Label>
          <Textarea
            value={form.version_description}
            onChange={e => set("version_description", e.target.value)}
            placeholder="What's new in this version..."
            rows={4}
          />
        </div>
      </motion.div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : "Save Configuration"}
        </Button>
      </div>
    </div>
  );
}