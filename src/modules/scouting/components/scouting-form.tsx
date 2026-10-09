"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/ids";
import { applyActionError } from "@/modules/farm/components/form-helpers";
import { logScouting } from "../actions";
import {
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  SCOUTING_SEVERITIES,
  SEVERITY_LABELS,
  scoutingCreateSchema,
  scoutingPhotoSchema,
  type ScoutingCreateInput,
} from "../schema";

/**
 * Server Actions accept ~1 MB bodies by default, so phone photos are
 * downscaled in the browser first (max 1600 px JPEG). Falls back to the
 * original file when the browser can't decode it.
 */
const TARGET_BYTES = 900 * 1024;
const MAX_EDGE = 1600;

async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= TARGET_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const g = canvas.getContext("2d");
    if (!g) return file;
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && (blob.size <= TARGET_BYTES || quality === 0.55)) {
        const name = file.name.replace(/\.[^.]+$/, "") || "scouting";
        return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
      }
    }
    return file;
  } catch {
    return file;
  }
}

export function ScoutingForm({
  cropCycleId,
  today,
}: {
  cropCycleId: string;
  /** Lagos calendar date (yyyy-MM-dd) from the server. */
  today: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [photo, setPhotoState] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const form = useForm<ScoutingCreateInput>({
    resolver: zodResolver(scoutingCreateSchema),
    defaultValues: {
      clientId: newId(),
      cropCycleId,
      date: today,
      pestOrDisease: "",
      severity: undefined,
      actionTaken: "",
    },
  });

  /** Swap the chosen photo and its object-URL preview (revoking the old one). */
  function setPhoto(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = next ? URL.createObjectURL(next) : null;
    previewRef.current = url;
    setPreview(url);
    setPhotoState(next);
  }

  // Release the last preview URL when leaving the page.
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    setPhotoError(null);
    if (!picked) return;
    if (!(PHOTO_TYPES as readonly string[]).includes(picked.type)) {
      setPhoto(null);
      setPhotoError("Use a JPEG, PNG or WebP photo.");
      e.target.value = "";
      return;
    }
    setPreparing(true);
    const shrunk = await shrinkPhoto(picked);
    setPreparing(false);
    const check = scoutingPhotoSchema.safeParse(shrunk);
    if (!check.success) {
      setPhoto(null);
      setPhotoError(check.error.issues[0]?.message ?? "Invalid photo.");
      e.target.value = "";
      return;
    }
    setPhoto(shrunk);
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onSubmit(values: ScoutingCreateInput) {
    const fd = new FormData();
    fd.set("clientId", values.clientId);
    fd.set("cropCycleId", values.cropCycleId);
    fd.set("date", values.date);
    fd.set("pestOrDisease", values.pestOrDisease);
    fd.set("severity", values.severity);
    fd.set("actionTaken", values.actionTaken ?? "");
    if (photo) fd.set("photo", photo, photo.name);

    let result;
    try {
      result = await logScouting(fd);
    } catch {
      toast.error(
        "Could not reach the server. Check your connection and try again.",
      );
      return;
    }
    if (result.ok) {
      toast.success(
        result.data.duplicate ? "Already saved" : "Scouting logged",
      );
      router.push(`/cycles/${cropCycleId}/scouting`);
      router.refresh();
      return;
    }
    if (result.fieldErrors?.photo?.[0]) setPhotoError(result.fieldErrors.photo[0]);
    applyActionError(form, result);
  }

  const busy = form.formState.isSubmitting || preparing;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input type="date" className="h-11" max={today} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="pestOrDisease"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pest or disease</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  autoComplete="off"
                  placeholder="e.g. Whitefly, Tuta absoluta, Early blight"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="severity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Severity</FormLabel>
              <div
                role="radiogroup"
                aria-label="Severity"
                className="grid grid-cols-3 gap-2"
              >
                {SCOUTING_SEVERITIES.map((s) => {
                  const selected = field.value === s;
                  return (
                    <Button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      variant={selected ? (s === "high" ? "destructive" : "default") : "outline"}
                      className="h-12"
                      onClick={() => field.onChange(s)}
                    >
                      {SEVERITY_LABELS[s]}
                    </Button>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <Label htmlFor="scouting-photo">Photo (optional)</Label>
          {preview ? (
            <div className="flex items-start gap-3">
              {/* Local object URL preview. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Selected scouting photo"
                className="bg-muted size-24 rounded-md border object-cover"
              />
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={clearPhoto}
              >
                <X className="size-4" /> Remove
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full"
            disabled={preparing}
            onClick={() => fileInput.current?.click()}
          >
            <Camera className="size-5" />
            {preparing ? "Preparing photo…" : photo ? "Retake photo" : "Take or choose photo"}
          </Button>
          <input
            ref={fileInput}
            id="scouting-photo"
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={onPick}
          />
          <p className="text-muted-foreground text-sm">
            JPEG, PNG or WebP, up to {PHOTO_MAX_BYTES / (1024 * 1024)} MB.
          </p>
          {photoError ? (
            <p className="text-destructive text-sm" role="alert">
              {photoError}
            </p>
          ) : null}
        </div>

        <FormField
          control={form.control}
          name="actionTaken"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Action taken</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="e.g. Removed infected leaves, scheduled spray"
                  {...field}
                />
              </FormControl>
              <FormDescription>Optional.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="h-12 w-full" disabled={busy}>
          {form.formState.isSubmitting ? "Saving…" : "Log scouting"}
        </Button>
      </form>
    </Form>
  );
}
