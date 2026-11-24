import { configure } from "@lukez/svelte-dnd";
import { m } from "#lib/paraglide/messages.js";

let done = false;

/**
 * Gives the drag and drop library our screen reader strings. The messages are read when they are
 * spoken, so they follow the locale. The zones never exchange entries, so `dragStarted` does not
 * mention moving to another list.
 */
export function setupDnd(): void {
  if (done) return;
  done = true;
  configure({
    ariaStrings: {
      dragStarted: ({ itemLabel }) => m.dnd_drag_started({ item: itemLabel }),
      movedToPosition: ({ itemLabel, position, count }) =>
        m.dnd_moved_to_position({ item: itemLabel, position, count }),
      movedToZoneEnd: ({ itemLabel, zoneLabel }) =>
        m.dnd_moved_to_zone_end({ item: itemLabel, zone: zoneLabel }),
      movedToZoneStart: ({ itemLabel, zoneLabel }) =>
        m.dnd_moved_to_zone_start({ item: itemLabel, zone: zoneLabel }),
      dropped: ({ itemLabel, position, count }) => m.dnd_dropped({ item: itemLabel, position, count }),
      zoneActiveInstruction: () => m.dnd_zone_active_instruction(),
      zoneDragDisabledInstruction: m.dnd_zone_drag_disabled_instruction(),
    },
  });
}
