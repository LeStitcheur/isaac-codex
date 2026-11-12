/** Primitives d'interface (style shadcn/ui : Radix + Tailwind + class-variance-authority). */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border border-transparent font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-blood border-[#ff5266] text-white shadow-[0_6px_23px_#ff294525] hover:bg-[#ff5269] hover:border-[#ff7b89]',
        parchment: 'bg-surface-2 border-[#303b48] text-[#c9d2dd] hover:bg-surface-3 hover:border-[#46576a] hover:text-white aria-pressed:border-blood/40 aria-pressed:bg-blood/10 aria-pressed:text-blood-bright',
        outline: 'border-white/10 bg-transparent text-[#b9c3d0] hover:bg-white/[0.03] hover:border-white/20 hover:text-white',
        ghost: 'text-[#7e8ca0] hover:bg-surface-3 hover:text-white',
        subtle: 'bg-surface-2 border-[#303b48] text-[#c9d2dd] hover:bg-surface-3 hover:text-white',
      },
      size: {
        sm: 'h-[34px] px-3 text-[11px]',
        md: 'h-10 px-4 text-xs',
        lg: 'h-12 px-6 text-sm',
        icon: 'h-8 w-8 rounded-[7px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-4 pb-2', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold text-parchment', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-2', className)} {...props} />;
}

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-md border px-2 py-[5px] text-[10px] font-semibold leading-none tracking-wide whitespace-nowrap', {
  variants: {
    variant: {
      default: 'border-[#35404d] bg-[#222a33] text-[#a7b2c0]',
      blood: 'border-[#66313f] bg-[#391c27] text-[#ff839b]',
      parchment: 'border-[#35404d] bg-[#222a33] text-[#d9dee6]',
      ok: 'border-[#24523e] bg-[#12372a] text-[#7fe1b1]',
      warn: 'border-[#5b4527] bg-[#392e1b] text-[#ebc581]',
      muted: 'border-line bg-surface-2 text-muted',
    },
  },
  defaultVariants: { variant: 'default' },
});
export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-10 w-full rounded-lg border border-[#272f39] bg-[#141920] px-3 text-[13px] text-ink placeholder:text-[#6e7b8b] focus:border-blood/60 focus:outline-none',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn('h-10 w-full rounded-lg border border-[#272f39] bg-[#141920] px-2 text-[13px] text-ink focus:border-blood/60 focus:outline-none', className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium text-muted', className)} {...props} />;
}

export function Progress({ value, className, tone = 'blood' }: { value: number; className?: string; tone?: 'blood' | 'parchment' | 'ok' }) {
  const color = tone === 'blood' ? 'bg-gradient-to-r from-blood-dark to-blood' : tone === 'ok' ? 'bg-ok' : 'bg-parchment-dark';
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full transition-[width] duration-500', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/* Dialog */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ className, children, title, description, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-abyss/80 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn('panel fixed left-1/2 top-[8vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 p-5 animate-rise focus:outline-none', className)}
        {...props}
      >
        <DialogPrimitive.Title className="text-xl font-semibold tracking-tight text-parchment">{title}</DialogPrimitive.Title>
        {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
        <div className="mt-4">{children}</div>
        <DialogPrimitive.Close className="absolute right-3 top-3 rounded p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Fermer">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* Tabs */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex flex-wrap gap-5 border-b border-line', className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px border-b-2 border-transparent px-0.5 pb-2.5 pt-1 text-xs font-medium text-muted transition-colors hover:text-ink data-[state=active]:border-blood data-[state=active]:text-parchment cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

/* Tooltip */
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-lg border border-line bg-[#141920] px-2.5 py-1.5 text-xs text-ink shadow-lg animate-rise">
          {content}
          <TooltipPrimitive.Arrow className="fill-[#141920]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-[#303c49] bg-[#202832] px-1.5 py-0.5 font-sans text-[9px] text-[#8190a0]">{children}</kbd>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-surface-2', className)} />;
}
