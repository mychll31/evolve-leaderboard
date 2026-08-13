"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Banner, Button, useAction } from "@/components/admin/controls";
import { removeAvatarAction, saveAvatarAction } from "@/app/actions/account";

/**
 * Square avatar cropper: pick a file, drag to position, slide to zoom.
 *
 * Hand-rolled rather than pulled from `react-easy-crop` or similar, which
 * would be the only UI dependency in this project. A zoom slider also avoids
 * the pinch-gesture handling that is most of what those libraries carry, and
 * works the same with a mouse.
 *
 * Preview and export share one draw function, so what is dragged into place is
 * exactly what gets uploaded.
 */

/** On-screen crop window, in CSS pixels. */
const VIEWPORT = 264;

/** Exported edge length. Twice the largest place an avatar is rendered. */
const OUTPUT = 256;

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type Offset = { x: number; y: number };

/**
 * Draws the image "cover"-fitted to a square of `size`, scaled and shifted.
 *
 * Offsets are fractions of the square rather than pixels, so the same numbers
 * describe the preview and the larger export.
 */
function paint(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap,
  size: number,
  zoom: number,
  offset: Offset,
): void {
  const cover = size / Math.min(image.width, image.height);
  const width = image.width * cover * zoom;
  const height = image.height * cover * zoom;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(
    image,
    (size - width) / 2 + offset.x * size,
    (size - height) / 2 + offset.y * size,
    width,
    height,
  );
}

/** How far the image can slide before its edge would enter the square. */
function limits(image: ImageBitmap, zoom: number): Offset {
  const ratio = image.width / image.height;
  const wide = ratio >= 1;
  return {
    x: Math.max(0, ((wide ? ratio : 1) * zoom - 1) / 2),
    y: Math.max(0, ((wide ? 1 : 1 / ratio) * zoom - 1) / 2),
  };
}

/**
 * Base64 by hand because `Buffer` does not exist in the browser and Next.js
 * stopped polyfilling it. Chunked so a large image cannot blow the argument
 * limit on `String.fromCharCode`.
 */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function clamp(offset: Offset, image: ImageBitmap, zoom: number): Offset {
  const max = limits(image, zoom);
  return {
    x: Math.min(max.x, Math.max(-max.x, offset.x)),
    y: Math.min(max.y, Math.max(-max.y, offset.y)),
  };
}

export function AvatarCropper({ hasAvatar }: { hasAvatar: boolean }) {
  const { pending, error, success, act, setError } = useAction();

  const canvas = useRef<HTMLCanvasElement>(null);
  const dragFrom = useRef<{ x: number; y: number; offset: Offset } | null>(null);

  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });

  useEffect(() => {
    const element = canvas.current;
    if (!element || !image) return;

    const dpr = window.devicePixelRatio || 1;
    element.width = VIEWPORT * dpr;
    element.height = VIEWPORT * dpr;

    const ctx = element.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(ctx, image, VIEWPORT, zoom, offset);
  }, [image, zoom, offset]);

  const pick = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);

      if (file.size > MAX_SOURCE_BYTES) {
        setError("That image is too large to open. Try one under 25MB.");
        return;
      }

      try {
        // `from-image` applies EXIF orientation, without which photographs
        // taken on a phone land on their side.
        const bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
        });
        setImage(bitmap);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      } catch {
        setError("That file could not be read as an image.");
      }
    },
    [setError],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragFrom.current = { x: event.clientX, y: event.clientY, offset };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const from = dragFrom.current;
    if (!from || !image) return;

    setOffset(
      clamp(
        {
          x: from.offset.x + (event.clientX - from.x) / VIEWPORT,
          y: from.offset.y + (event.clientY - from.y) / VIEWPORT,
        },
        image,
        zoom,
      ),
    );
  };

  const onPointerUp = () => {
    dragFrom.current = null;
  };

  const changeZoom = (next: number) => {
    setZoom(next);
    if (image) setOffset((current) => clamp(current, image, next));
  };

  const save = () => {
    if (!image) return;

    const out = document.createElement("canvas");
    out.width = OUTPUT;
    out.height = OUTPUT;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    paint(ctx, image, OUTPUT, zoom, offset);

    out.toBlob(
      (blob) => {
        if (!blob) {
          setError("That image could not be prepared. Please try another.");
          return;
        }

        act(
          async () => {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return saveAvatarAction({
              mime: "image/webp",
              base64: toBase64(bytes),
            });
          },
          {
            successMessage: "Photo updated",
            onDone: () => setImage(null),
          },
        );
      },
      "image/webp",
      0.85,
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      {image ? (
        <>
          <div className="flex flex-col items-center gap-3">
            <canvas
              ref={canvas}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ width: VIEWPORT, height: VIEWPORT }}
              className="bg-surface-2 border-line touch-none cursor-grab rounded-full border active:cursor-grabbing"
            />
            <p className="text-ink-3 text-[11.5px] font-semibold">
              Drag to position
            </p>

            <label className="flex w-full max-w-[264px] items-center gap-3">
              <span className="text-ink-3 text-[10px] font-extrabold tracking-[0.14em] uppercase">
                Zoom
              </span>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(event) => changeZoom(Number(event.target.value))}
                className="accent-primary flex-1"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save photo"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setImage(null)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="border-line text-ink-2 hover:bg-surface-2 cursor-pointer rounded-[10px] border bg-white px-4 py-2.5 text-[11.5px] font-extrabold tracking-[0.06em] uppercase transition-colors">
            {hasAvatar ? "Change photo" : "Upload photo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void pick(event.target.files?.[0]);
                // Cleared so choosing the same file twice still fires.
                event.target.value = "";
              }}
            />
          </label>

          {hasAvatar && (
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() =>
                act(() => removeAvatarAction(), {
                  successMessage: "Photo removed",
                })
              }
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
