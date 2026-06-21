import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  className?: string;
}

export default function CustomSelect({ value, onChange, options, placeholder = "-- Vyberte --", className = "" }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full border rounded-xl px-4 py-3 flex items-center justify-between transition-all outline-none text-left bg-white
          ${isOpen ? 'border-[#CCAD8A] ring-2 ring-[#CCAD8A]/20' : 'border-gray-200 hover:border-gray-300'}
        `}
      >
        <span className={`font-medium text-sm truncate ${!selectedOption ? 'text-gray-500' : 'text-gray-900'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-lg py-1 max-h-60 overflow-auto animate-in fade-in slide-in-from-top-2 duration-200">
          {options.map((opt, idx) => (
            <button
              key={opt.value + idx}
              type="button"
              disabled={opt.disabled}
              onClick={() => {
                if (!opt.disabled) {
                  onChange(opt.value);
                  setIsOpen(false);
                }
              }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center
                ${opt.disabled ? 'text-gray-400 cursor-not-allowed bg-gray-50' : 'text-gray-700 hover:bg-gray-50'}
                ${value === opt.value ? 'bg-[#CCAD8A]/5 text-[#CCAD8A] font-bold' : ''}
              `}
            >
              <div className="truncate w-full">{opt.label}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
