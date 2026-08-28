"use client";

import { useState } from "react";

export function PhotoInput({ name = "photo" }: { name?: string }) {
  const [filename, setFilename] = useState("");
  return (
    <label className="block">
      <span className="mb-1 block text-sm">Photo proof</span>
      <input
        type="file"
        name={name}
        accept="image/*"
        onChange={(e) => setFilename(e.target.files?.[0]?.name ?? "")}
        className="block w-full text-sm"
      />
      {/* Upload wiring arrives in K4; here we just echo the chosen filename. */}
      {filename && <span className="mt-1 block text-xs text-muted-foreground">{filename}</span>}
    </label>
  );
}