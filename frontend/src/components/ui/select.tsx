"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Sentinela interna para representar valor vazio ("") no Radix UI
const EMPTY = "__none__";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Se fornecido, adiciona uma primeira opção com value="" e este label */
  emptyLabel?: string;
  className?: string;
  /** "sm" = px-3 py-2 text-sm (padrão) | "xs" = px-2 py-1.5 text-xs */
  size?: "sm" | "xs";
  disabled?: boolean;
}

const SIZE_CLASSES = {
  sm: "px-3 py-2 text-sm",
  xs: "px-2 py-1.5 text-xs",
};

export function Select({
  value,
  onChange,
  options,
  emptyLabel,
  className,
  size = "sm",
  disabled,
}: SelectProps) {
  const radixValue = value === "" && emptyLabel ? EMPTY : value;

  return (
    <SelectPrimitive.Root
      value={radixValue}
      onValueChange={(v) => onChange(v === EMPTY ? "" : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        className={cn(
          "flex items-center justify-between gap-2 border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 data-[placeholder]:text-slate-400",
          SIZE_CLASSES[size],
          className
        )}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-[200] bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden"
          position="popper"
          sideOffset={4}
          style={{ width: "var(--radix-select-trigger-width)", minWidth: "8rem" }}
        >
          <SelectPrimitive.Viewport className="p-1">
            {emptyLabel && (
              <SelectPrimitive.Item
                value={EMPTY}
                className="relative flex items-center px-3 py-2 text-sm text-slate-500 rounded-md cursor-pointer select-none outline-none data-[highlighted]:bg-slate-100"
              >
                <SelectPrimitive.ItemText>{emptyLabel}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            )}
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center justify-between px-3 py-2 text-sm text-slate-700 rounded-md cursor-pointer select-none outline-none data-[highlighted]:bg-slate-100 data-[state=checked]:text-blue-600 data-[state=checked]:font-medium"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="w-3.5 h-3.5 text-blue-600 ml-2" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
