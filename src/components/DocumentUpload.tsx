import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, Clock } from 'lucide-react';
import { useToast } from "./ui/Toast";

export interface UploadResult {
  type?: string;
  data?: {
    items?: {item?: string; description?: string; quantity?: number; unit_price?: number}[];
    type?: string;
    supplier?: string;
    date?: string;
    total_amount?: number;
  };
  source_image_url?: string;
}

export function DocumentUpload({ onUploadComplete, t }: { onUploadComplete: (data?: UploadResult) => void, t: Record<string, string> }) {
  const toast = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isDraft, setIsDraft] = useState(true); // Default to true (fast mobile upload)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const url = isDraft ? '/api/documents/upload?draft=true' : '/api/documents/upload';
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        onUploadComplete(data);
      } else {
        const err = await res.json();
        toast(`${t.error || "Error"}: ${err.error || "Upload failed"}`, "error");
      }
    } catch (e) {
      console.error(e);
      toast(t.connectionError || "Connection error.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-6 bg-[#0A0A0A] border border-white/5 rounded-2xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white">{t.newDocument}</h3>
        <label className="flex items-center space-x-2 text-sm text-slate-400 cursor-pointer">
          <input 
            type="checkbox" 
            checked={isDraft} 
            onChange={(e) => setIsDraft(e.target.checked)} 
            className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
          />
          <span>{t.quickDraft}</span>
        </label>
      </div>
      <label className="block w-full h-32 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/50 transition-all">
        <Upload className="w-8 h-8 text-slate-500 mb-2" />
        <span className="text-sm font-bold text-slate-400">
          {isUploading ? (isDraft ? t.uploading : t.aiProcessing) : t.dragDrop}
        </span>
        <input type="file" className="hidden" onChange={handleUpload} accept="image/*,application/pdf" capture="environment" disabled={isUploading} />
      </label>
    </div>
  );
}
