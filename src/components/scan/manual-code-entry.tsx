"use client";

import { useState } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Fallback when the camera can't be used: paste/type the label URL or the
 * bare batch id printed under the QR.
 */
export function ManualCodeEntry({
  onSubmit,
  label = "Or type the code",
}: {
  onSubmit: (text: string) => void;
  label?: string;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (t) onSubmit(t);
      }}
    >
      <Label htmlFor="manual-code" className="flex items-center gap-2">
        <Keyboard className="size-4" /> {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id="manual-code"
          className="h-11"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Label link or batch ID"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" className="h-11 px-5" disabled={!text.trim()}>
          Go
        </Button>
      </div>
    </form>
  );
}
