import React from "react";

export function NavItem({
  icon,
  label,
  isActive,
  onClick,
  isOpen,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center ${isOpen ? "justify-start px-4" : "justify-center"} py-1.5 mb-1 transition-all duration-500 group relative overflow-hidden ${
        isActive
          ? "side-light-active text-white"
          : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
      }`}
      title={!isOpen ? label : undefined}
    >
      {isActive && (
        <>
          <div className="side-light-filament"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500/10 to-transparent -z-10"></div>
        </>
      )}
      <span
        className={`${isActive ? "text-brand-500 scale-105" : "text-slate-500 group-hover:text-slate-300 group-hover:scale-105"} transition-all duration-300 relative z-10 mr-1`}
      >
        {icon}
      </span>
      {isOpen && (
        <span
          className={`ml-3 font-bold text-base tracking-tight whitespace-nowrap overflow-hidden relative z-10 ${isActive ? "text-white led-text-glow" : "text-slate-500 group-hover:text-slate-200"}`}
        >
          {label}
        </span>
      )}
    </button>
  );
}
