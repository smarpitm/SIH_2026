"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n";

export function PhotoInput({
  name = "photo",
  label,
  accept = "image/*",
}: {
  name?: string;
  label?: string;
  accept?: string;
}) {
  const { t } = useTranslation();
  const [filename, setFilename] = useState("");
  const labelText = label ?? t("ui.photoProof", "Photo proof");
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <input
        type="file"
        name={name}
        accept={accept}
        onChange={(e) => setFilename(e.target.files?.[0]?.name ?? "")}
        className="block w-full text-sm"
      />
      {filename && <span className="mt-1 block text-xs text-muted-foreground">{filename}</span>}
    </label>
  );
}