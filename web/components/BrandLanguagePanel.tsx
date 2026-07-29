"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import type { BrandLanguage } from "@/lib/brand-language";

type Props = {
  language: BrandLanguage;
  onChange: (language: BrandLanguage) => void;
};

function ChipList({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex min-w-0 flex-wrap gap-2">
        {values.map((value) => (
          <Badge
            key={value}
            variant="secondary"
            className="h-auto max-w-full min-w-0 gap-1 whitespace-normal break-words pr-1 text-left leading-snug"
          >
            {value}
            <button
              type="button"
              className="shrink-0 rounded-full p-0.5 hover:bg-black/10"
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              if (!values.includes(draft.trim())) onChange([...values, draft.trim()]);
              setDraft("");
            }
          }}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Add"
          onClick={() => {
            if (!draft.trim()) return;
            if (!values.includes(draft.trim())) onChange([...values, draft.trim()]);
            setDraft("");
          }}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function BrandLanguagePanel({ language, onChange }: Props) {
  return (
    <section className="space-y-3 border-t border-[#efefef] pt-5">
      <div>
        <h3 className="type-ui text-[#171618]">Brand language</h3>
        <p className="mt-1 type-caption text-[#5c5e60]">
          Optional. Approved and avoided phrases applied to hooks and prompts.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="brandTone">Tone</Label>
        <Textarea
          id="brandTone"
          rows={2}
          value={language.tone}
          onChange={(e) => onChange({ ...language, tone: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="visualGrammar">Visual grammar</Label>
        <Textarea
          id="visualGrammar"
          rows={3}
          value={language.visualGrammar}
          onChange={(e) => onChange({ ...language, visualGrammar: e.target.value })}
        />
      </div>

      <ChipList
        label="Approved phrases / motifs"
        values={language.approvedPhrases}
        onChange={(approvedPhrases) => onChange({ ...language, approvedPhrases })}
        placeholder="Add approved phrase"
      />

      <ChipList
        label="Avoided phrases"
        values={language.avoidedPhrases}
        onChange={(avoidedPhrases) => onChange({ ...language, avoidedPhrases })}
        placeholder="Add phrase to avoid"
      />

      <ChipList
        label="Recurring motifs"
        values={language.motifs}
        onChange={(motifs) => onChange({ ...language, motifs })}
        placeholder="Add visual motif"
      />
    </section>
  );
}
