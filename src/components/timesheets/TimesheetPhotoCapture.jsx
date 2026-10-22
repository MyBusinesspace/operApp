import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, Loader2, CheckCircle, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// A simple camera capture component that uploads the photo and returns a URL
// Props: onPhoto(url) — called when a photo is captured & uploaded
//        required — show as required field
//        label — label text
export default function TimesheetPhotoCapture({ onPhoto, required = false, label = "Take a Photo" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const [mode, setMode] = useState("idle"); // idle | camera | preview | uploading | done
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [error, setError] = useState(null);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setMode("camera");
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);
    } catch {
      // Fall back to file input
      fileInputRef.current?.click();
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    setPreviewUrl(dataUrl);
    setMode("preview");
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewUrl(ev.target.result);
      setMode("preview");
    };
    reader.readAsDataURL(file);
  };

  const uploadPhoto = async () => {
    if (!previewUrl) return;
    setMode("uploading");
    setError(null);
    try {
      // Convert dataUrl to Blob
      const res = await fetch(previewUrl);
      const blob = await res.blob();
      const file = new File([blob], "clock_photo.jpg", { type: "image/jpeg" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadedUrl(file_url);
      setMode("done");
      onPhoto(file_url);
    } catch (e) {
      setError("Upload failed. Please retry.");
      setMode("preview");
    }
  };

  const reset = () => {
    stopCamera();
    setMode("idle");
    setPreviewUrl(null);
    setUploadedUrl(null);
    setError(null);
    onPhoto(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Camera className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{label}</span>
        {required && <span className="text-destructive text-xs">*</span>}
      </div>

      {mode === "idle" && (
        <button
          type="button"
          onClick={startCamera}
          className="w-full flex flex-col items-center gap-2 py-5 border-2 border-dashed border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary"
        >
          <Camera className="w-7 h-7" />
          <span className="text-sm">Tap to take photo</span>
          {required && <span className="text-xs text-destructive">Required</span>}
        </button>
      )}

      {mode === "camera" && (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button type="button" className="flex-1 gap-2" onClick={capture}>
              <Camera className="w-4 h-4" /> Capture
            </Button>
            <Button type="button" variant="outline" onClick={() => { stopCamera(); setMode("idle"); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {mode === "preview" && (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" className="flex-1 gap-2" onClick={uploadPhoto}>
              <CheckCircle className="w-4 h-4" /> Use this photo
            </Button>
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => { setMode("idle"); setPreviewUrl(null); }}>
              <RefreshCw className="w-4 h-4" /> Retake
            </Button>
          </div>
        </div>
      )}

      {mode === "uploading" && (
        <div className="flex items-center justify-center gap-2 py-5 border rounded-xl text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Uploading photo...</span>
        </div>
      )}

      {mode === "done" && (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
            <img src={uploadedUrl} alt="Captured" className="w-full h-full object-cover" />
            <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
              <CheckCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-destructive underline">
            Remove & retake
          </button>
        </div>
      )}

      {/* Hidden file input for fallback */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}