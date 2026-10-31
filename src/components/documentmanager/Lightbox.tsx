// T3.2 : extrait de src/components/DocumentManager.tsx (extraction pure, byte-exact).
// Lightbox image agrandie : JSX sans hook interne ; props = enlargedImage/
// setEnlargedImage/t. Le garde {enlargedImage && ...} est déplacé ici (return null
// sinon) — effet de rendu identique. JSX Copié tel quel.
import { X } from 'lucide-react';
import { MediaDisplay } from '../../lib/helpers';

export function Lightbox({ enlargedImage, setEnlargedImage, t }: {
  enlargedImage: string | null; setEnlargedImage: (v: string | null) => void;
  t: Record<string, string>;
}) {
  if (!enlargedImage) return null;
  return (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative w-[90vw] h-[90vh] flex items-center justify-center">
            <button
              className="absolute -top-12 right-0 text-white hover:text-emerald-400 bg-black/50 p-2 rounded-full transition-colors z-[210]"
              onClick={() => setEnlargedImage(null)}
            >
              <X size={24} />
            </button>
            <MediaDisplay
              src={enlargedImage}
              alt={t.enlargedDocAlt || "Document agrandi"}
              className="w-full h-full object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
              interactive={true}
              onClick={(e: MouseEvent) => e.stopPropagation()}
            />
          </div>
        </div>
  );
}
