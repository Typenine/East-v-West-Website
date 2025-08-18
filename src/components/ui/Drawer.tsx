"use client";

import { Dialog, Transition } from "@headlessui/react";
import { Fragment, ReactNode } from "react";

export function Drawer({
  open,
  onClose,
  side = "right",
  title,
  children,
  width = 420,
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const sideClass = side === "right" ? "right-0 translate-x-full" : "left-0 -translate-x-full";
  const enterTo = side === "right" ? "translate-x-0" : "translate-x-0";

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 flex">
            <Transition.Child
              as={Fragment}
              enter="transform transition ease-out duration-200"
              enterFrom={sideClass}
              enterTo={enterTo}
              leave="transform transition ease-in duration-150"
              leaveFrom={enterTo}
              leaveTo={sideClass}
            >
              <Dialog.Panel
                style={{ width }}
                className="evw-surface border border-[var(--border)] h-full shadow-[var(--shadow-soft)]"
              >
                {title && (
                  <div className="px-4 py-3 border-b border-[var(--border)]">
                    <Dialog.Title className="text-base font-semibold text-[var(--text)]">{title}</Dialog.Title>
                  </div>
                )}
                <div className="p-4 h-full overflow-y-auto">{children}</div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export default Drawer;
