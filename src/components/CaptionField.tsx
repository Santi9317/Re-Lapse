"use client";

import { useEffect, useRef, useState } from "react";
import { updateCaption } from "@/lib/api";

export function CaptionField({
  id,
  caption,
  disabled = false,
  onDraft,
  onCaption,
}: {
  id: string;
  caption: string;
  disabled?: boolean;
  onDraft?: (id: string, value: string) => void;
  onCaption?: (id: string, caption: string) => void;
}) {
  const [value, setValue] = useState(caption);
  const [note, setNote] = useState("");
  const valueRef = useRef(caption);
  const saved = useRef(caption);
  const focused = useRef(false);
  const seenId = useRef(id);

  useEffect(() => {
    if (seenId.current !== id) {
      seenId.current = id;
      valueRef.current = caption;
      saved.current = caption;
      setValue(caption);
      setNote("");
      return;
    }
    saved.current = caption;
    if (focused.current) return;
    if (onDraft && valueRef.current.trim() !== caption.trim()) return;
    valueRef.current = caption;
    setValue(caption);
  }, [id, caption, onDraft]);

  async function commit(nextValue: string) {
    if (onDraft) return;
    const next = nextValue.trim();
    if (next === saved.current.trim()) return;
    setNote("");
    try {
      const result = await updateCaption(id, next);
      saved.current = result.caption;
      valueRef.current = result.caption;
      setValue(result.caption);
      onCaption?.(id, result.caption);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That caption didn't stick.");
    }
  }

  return (
    <>
      <input
        className="field"
        maxLength={80}
        placeholder="Caption, if you want one"
        value={value}
        aria-label="Caption"
        data-caption={id}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          valueRef.current = next;
          setValue(next);
          onDraft?.(id, next);
        }}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={(event) => {
          focused.current = false;
          void commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      <div className="count">{value.trim().length}/80</div>
      {note ? <p className="error">{note}</p> : null}
    </>
  );
}
