import {
  useEffect,
  useId,
  useRef,
  useState,
  type Ref,
  type PointerEvent,
  type ComponentProps,
} from "react";
import { Waves } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { twMerge } from "tailwind-merge";
import { MotionModeSelector } from "./motion-mode";
import { useMotionMode } from "./motion-mode/context";

type ContentProps = ComponentProps<typeof PopoverContent>;
export type MotionMenuReason = "hover" | "explicit" | "dismiss";
export interface MotionMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean, reason: MotionMenuReason) => void;
  contentRef?: Ref<HTMLDivElement>;
  hoverCancellationKey?: unknown;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  align?: ContentProps["align"];
  side?: ContentProps["side"];
  onFocusOutside?: ContentProps["onFocusOutside"];
  onCloseAutoFocus?: ContentProps["onCloseAutoFocus"];
}

/** Shared corner/navbar menu; preference ownership stays in the root provider. */
export function MotionMenu({
  open,
  onOpenChange,
  contentRef,
  hoverCancellationKey,
  disabled = false,
  className,
  contentClassName,
  align = "end",
  side = "bottom",
  onFocusOutside,
  onCloseAutoFocus,
}: MotionMenuProps): React.JSX.Element {
  const { mode, setMode } = useMotionMode();
  const [localOpen, setLocalOpen] = useState(false);
  const explicit = useRef(false);
  const suppressHover = useRef(false);
  const pointerOverTrigger = useRef(false);
  const preserveFocus = useRef(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const isOpen = !disabled && (open ?? localOpen);
  const selector = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tabExit = useRef(false);
  const escapeExit = useRef(false);
  const labelId = useId();
  const openChange = useRef(onOpenChange);
  useEffect(() => {
    openChange.current = onOpenChange;
  }, [onOpenChange]);
  const cancelTimers = (): void => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  };
  useEffect(() => cancelTimers, []);
  useEffect(() => {
    cancelTimers();
    if (!isOpen) explicit.current = false;
  }, [isOpen, hoverCancellationKey, disabled]);
  useEffect(() => {
    if (disabled) {
      setLocalOpen(false);
      openChange.current?.(false, "dismiss");
    }
  }, [disabled]);
  const changeOpen = (
    next: boolean,
    reason: MotionMenuReason = "dismiss",
  ): void => {
    cancelTimers();
    if (!next) {
      // A dismissed panel disappears, so no leave event is guaranteed there.
      // Only a pointer still over the persistent trigger needs suppression.
      suppressHover.current = pointerOverTrigger.current;
      explicit.current = false;
    }
    setLocalOpen(next);
    onOpenChange?.(next, reason);
  };
  const promote = (): void => {
    cancelTimers();
    explicit.current = true;
    preserveFocus.current = false;
  };
  const enter = (event: PointerEvent): void => {
    if (disabled || event.pointerType !== "mouse") return;
    pointerOverTrigger.current = event.currentTarget === trigger.current;
    clearTimeout(closeTimer.current);
    if (isOpen || suppressHover.current) return;
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => {
      preserveFocus.current = true;
      explicit.current = false;
      changeOpen(true, "hover");
    }, 150);
  };
  const leave = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") return;
    pointerOverTrigger.current = false;
    suppressHover.current = false;
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    if (isOpen && !explicit.current) {
      closeTimer.current = setTimeout(() => {
        if (!explicit.current) {
          changeOpen(false);
          suppressHover.current = false;
        }
      }, 250);
    }
  };
  return (
    <Popover open={isOpen} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={trigger}
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label="Motion settings"
          data-motion-menu
          data-motion-open={isOpen}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onClick={(event) => {
            event.preventDefault();
            if (isOpen && explicit.current) {
              changeOpen(false);
            } else {
              promote();
              changeOpen(true, "explicit");
              selector.current
                ?.querySelector<HTMLButtonElement>('button[data-state="on"]')
                ?.focus();
            }
          }}
          className={twMerge(
            "group size-8 shrink-0 rounded-full p-0 text-muted hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary data-[motion-open=true]:text-primary max-sm:size-11 pointer-coarse:size-11",
            className,
          )}
        >
          <span
            data-motion-face
            className="flex size-8 shrink-0 items-center justify-center rounded-full group-hover:bg-foreground/5 group-data-[motion-open=true]:bg-primary/10"
          >
            <Waves className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        data-motion-menu-panel
        aria-labelledby={labelId}
        align={align}
        side={side}
        sideOffset={8}
        collisionPadding={8}
        className={twMerge(
          "z-[60] flex w-max max-w-[calc(100vw-1rem)] items-center gap-4",
          contentClassName,
        )}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocusCapture={promote}
        onFocusOutside={(event) => onFocusOutside?.(event)}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (!explicit.current) return;
          selector.current
            ?.querySelector<HTMLButtonElement>('button[data-state="on"]')
            ?.focus();
        }}
        onEscapeKeyDown={(event) => {
          escapeExit.current = true;
          event.stopPropagation();
        }}
        onKeyDownCapture={(event) => {
          if (
            event.key !== "Tab" ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
          )
            return;
          // Radix popovers loop Tab even when nonmodal. Resume the document's
          // tab order at the trigger instead; Shift+Tab returns to the trigger.
          event.stopPropagation();
          if (event.shiftKey) event.preventDefault();
          tabExit.current = true;
          trigger.current?.focus({ preventScroll: true });
          changeOpen(false);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (tabExit.current || preserveFocus.current || disabled) {
            event.preventDefault();
            tabExit.current = false;
          } else if (escapeExit.current && !event.defaultPrevented) {
            // Promoting a hover preview clicks outside the portal. Radix records
            // that interaction and otherwise skips its normal trigger restore.
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }
          escapeExit.current = false;
        }}
      >
        <span id={labelId} className="font-sans text-sm leading-5">
          Motion
        </span>
        <div ref={selector}>
          <MotionModeSelector
            value={mode}
            onValueChange={(value) => {
              promote();
              setMode(value);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
