import React, { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, RotateCcw, Loader2, Check } from "lucide-react";

const CROP_SIZE = 280;        // displayed crop area (px)
const OUTPUT_SIZE = 400;      // exported image resolution

export default function AvatarCropperModal({ open, imageSrc, onClose, onCropComplete }) {
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [comicFilter, setComicFilter] = useState(true);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Reset state whenever a new image is loaded
  useEffect(() => {
    if (open) { setZoom(1); setMinZoom(1); setOffset({ x: 0, y: 0 }); }
  }, [open, imageSrc]);

  // When the image loads, compute a "cover" zoom so it fills the circle
  const handleImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const cover = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
    const z = Math.max(cover, 0.1);
    setMinZoom(z);
    setZoom(z);
    setOffset({ x: 0, y: 0 });
  };

  const clampOffset = useCallback((x, y, z) => {
    const img = imgRef.current;
    if (!img) return { x, y };
    const cw = containerRef.current?.clientWidth || CROP_SIZE;
    const ch = containerRef.current?.clientHeight || CROP_SIZE;
    const displayedW = img.naturalWidth * z;
    const displayedH = img.naturalHeight * z;
    const maxX = Math.max(0, (displayedW - cw) / 2);
    const maxY = Math.max(0, (displayedH - ch) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }, []);

  const onPointerDown = (e) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const clamped = clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, zoom);
    setOffset(clamped);
  };

  const onPointerUp = () => setDragging(false);

  const handleZoomChange = (val) => {
    const z = val[0];
    const clamped = clampOffset(offset.x, offset.y, z);
    setOffset(clamped);
    setZoom(z);
  };

  const reset = () => { setZoom(minZoom); setOffset({ x: 0, y: 0 }); };

  // Comic Classic stylization: posterize + boost contrast/saturation + black edge outlines.
  // Produces the comic-book look used by Caesar, Leslie and the rest of the avatars.
  const applyComicFilter = (ctx, w, h) => {
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // Grayscale buffer for edge detection
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    }

    // Sobel edge magnitude
    const edges = new Uint8ClampedArray(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx =
          -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
          gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
        const gy =
          -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
          gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
        edges[i] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      }
    }

    const levels = 5;
    const step = 255 / (levels - 1);
    const contrast = 1.35;
    const sat = 1.4;

    for (let i = 0; i < d.length; i += 4) {
      // Contrast
      let r = (d[i] - 128) * contrast + 128;
      let g = (d[i + 1] - 128) * contrast + 128;
      let b = (d[i + 2] - 128) * contrast + 128;
      // Saturation
      const lum = r * 0.3 + g * 0.59 + b * 0.11;
      r = lum + (r - lum) * sat;
      g = lum + (g - lum) * sat;
      b = lum + (b - lum) * sat;
      // Posterize
      r = Math.round(Math.max(0, Math.min(255, r)) / step) * step;
      g = Math.round(Math.max(0, Math.min(255, g)) / step) * step;
      b = Math.round(Math.max(0, Math.min(255, b)) / step) * step;
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }

    // Overlay black edge lines
    for (let p = 0; p < edges.length; p++) {
      const e = edges[p];
      if (e > 60) {
        const idx = p * 4;
        const blend = Math.min(1, e / 180);
        d[idx] = d[idx] * (1 - blend);
        d[idx + 1] = d[idx + 1] * (1 - blend);
        d[idx + 2] = d[idx + 2] * (1 - blend);
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  const handleApply = async () => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    setUploading(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");

      // White background for transparent PNGs
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      // Circular clip
      ctx.beginPath();
      ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Map displayed coordinates to source coordinates
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      // The visible image portion that fits in the crop area
      const srcScaleX = img.naturalWidth / (img.naturalWidth * zoom);
      const srcScaleY = img.naturalHeight / (img.naturalHeight * zoom);

      // Visible portion in source pixels
      const visibleSrcW = img.naturalWidth * srcScaleX; // == naturalWidth, but keep for clarity
      const visibleSrcH = img.naturalHeight * srcScaleY;

      // Source crop: center on offset
      const srcCenterX = img.naturalWidth / 2 - (offset.x / zoom);
      const srcCenterY = img.naturalHeight / 2 - (offset.y / zoom);

      // The source area mapped to the output canvas
      const srcW = (cw / zoom);
      const srcH = (ch / zoom);
      const srcX = srcCenterX - srcW / 2;
      const srcY = srcCenterY - srcH / 2;

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      if (comicFilter) {
        applyComicFilter(ctx, OUTPUT_SIZE, OUTPUT_SIZE);
      }

      canvas.toBlob(async (blob) => {
        const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
        const { base44 } = await import("@/api/base44Client");
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        onCropComplete(file_url);
        setUploading(false);
      }, "image/jpeg", 0.92);
    } catch (err) {
      console.error("Crop error:", err);
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !uploading && !o && onClose()}>
      <DialogContent className="max-w-md p-6 space-y-5">
        <DialogHeader>
          <DialogTitle>Adjust Photo</DialogTitle>
        </DialogHeader>

        <div
          ref={containerRef}
          className="relative mx-auto overflow-hidden rounded-full select-none touch-none"
          style={{ width: CROP_SIZE, height: CROP_SIZE, cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {imageSrc && (
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              crossOrigin="anonymous"
              draggable={false}
              onLoad={handleImageLoad}
              className="absolute top-1/2 left-1/2 max-w-none"
              style={{
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: "center",
                filter: comicFilter ? "contrast(1.3) saturate(1.35)" : "none",
              }}
            />
          )}
          {/* Overlay grid guides */}
          <div className="absolute inset-0 rounded-full pointer-events-none ring-1 ring-white/30" />
          <div className="absolute inset-[25%] rounded-full border border-white/20 pointer-events-none" />
          {/* Dark vignette outside crop circle */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: "inset 0 0 0 1000px rgba(0,0,0,0.45)", borderRadius: "50%" }}
          />
        </div>

        <p className="text-xs text-center text-muted-foreground">Drag to position · Scroll or use slider to zoom</p>

        <label className="flex items-center gap-2 justify-center cursor-pointer select-none">
          <input
            type="checkbox"
            checked={comicFilter}
            onChange={(e) => setComicFilter(e.target.checked)}
            className="w-4 h-4 rounded accent-primary cursor-pointer"
          />
          <span className="text-sm font-medium">Comic Classic filter</span>
          <span className="text-xs text-muted-foreground">· matches Caesar &amp; Leslie</span>
        </label>

        <div className="flex items-center gap-3 px-2">
          <ZoomOut className="w-4 h-4 text-muted-foreground shrink-0" />
          <Slider
            value={[zoom]}
            onValueChange={handleZoomChange}
            min={minZoom}
            max={Math.max(minZoom * 4, 4)}
            step={0.01}
            className="flex-1"
          />
          <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={reset} disabled={uploading}>
            <RotateCcw className="w-4 h-4 mr-1" /> Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
            <Button onClick={handleApply} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              {uploading ? "Saving..." : "Apply"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}