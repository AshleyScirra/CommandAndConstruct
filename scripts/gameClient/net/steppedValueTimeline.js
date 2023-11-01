import { ValueTimeline } from "./valueTimeline.js";
// SteppedValueTimeline is derived from ValueTimeline as a "stepped" variant.
// This is used for position values and events. Since these arrive only occasionally
// as one-off updates, it's not appropriate to interpolate between them.
// Instead the values are handled as updates when the simulation time reaches them.
export class SteppedValueTimeline extends ValueTimeline {
    // Return a timeline entry of { timestamp, value } if there is one older than
    // the given simulation time, and remove it from the timeline. Otherwise if
    // there is no update for this time, return null.
    GetSteppedValue(simulationTime) {
        let ret = null;
        if (this.timeline.length > 0) {
            // The timeline is sorted by timestamp, so the first entry is
            // always the oldest entry.
            const firstEntry = this.timeline[0];
            // If this entry is older than the given time, remove it and return it.
            if (firstEntry.timestamp < simulationTime) {
                this.timeline.shift();
                ret = firstEntry;
            }
        }
        return ret;
    }
}
