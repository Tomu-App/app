import { fireEvent, waitFor } from "@testing-library/svelte";
import { DRAGGED_ELEMENT_ID } from "@lukez/svelte-dnd";
import { flushSync } from "svelte";
import { expect } from "vitest";

// jsdom has no `document.scrollingElement`; the library reads it when a pointer drag starts.
export function allowPointerDrags(): void {
  Object.defineProperty(document, "scrollingElement", {
    value: document.documentElement,
    configurable: true,
  });
}

export const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Starts a mouse drag on `grip` and moves the pointer by `dx`, `dy` (twice, so the library has a start point). */
export async function mouseDrag(grip: Element, dx: number, dy: number): Promise<void> {
  await fireEvent.mouseDown(grip, { clientX: 10, clientY: 10, button: 0 });
  await fireEvent.mouseMove(window, { clientX: 10, clientY: 20 });
  await pause(30);
  await fireEvent.mouseMove(window, { clientX: 10 + dx, clientY: 20 + dy });
  await pause(30);
  flushSync();
}

/** Ends a pointer drag and waits until the library has put everything back. */
export async function release(): Promise<void> {
  await fireEvent.mouseUp(window);
  await fireEvent.touchEnd(window);
  await waitFor(() => expect(document.querySelector(".drop-slot")).toBeNull());
  await waitFor(() => expect(document.getElementById(DRAGGED_ELEMENT_ID)).toBeNull());
}

/** The element that follows the pointer during a drag. */
export const dragged = (): HTMLElement | null => document.getElementById(DRAGGED_ELEMENT_ID);
