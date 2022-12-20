
import { ValueTimeline } from "./valueTimeline.js";

// SteppedValueTimeline is derived from ValueTimeline as a "stepped" variant.
// This is used for position values. Since these arrive only occasionally (usually
// a couple of seconds apart), it's not worth trying to interpolate between them.
// Instead the values are used to update to the correct position when the simulation
// time reaches a value.
export class SteppedValueTimeline extends ValueTimeline {

	// Track the last simulation time, so very late messages that have an even
	// older timestamp aren't added to the timeline.
	#lastSimulationTime = -Infinity;
	
	// Override the Add() method to discard updates that are late.
	Add(timestamp, value)
	{
		if (timestamp <= this.#lastSimulationTime)
			return;
		
		super.Add(timestamp, value);
	}
	
	// Return a timeline entry of { timestamp, value } if there is one older than
	// the given simulation time, and remove it from the timeline. Otherwise if
	// there is no update for this time, return null.
	GetSteppedValue(simulationTime)
	{
		let ret = null;
		
		if (this.timeline.length > 0)
		{
			// The timeline is sorted by timestamp, so the first entry is
			// always the oldest entry.
			const firstEntry = this.timeline[0];
			
			// If this entry is older than the given time, remove it and return it.
			if (firstEntry.timestamp < simulationTime)
			{
				this.timeline.shift();
				ret = firstEntry;
			}
		}
		
		// Update the last simulation time so late messages are discarded.
		this.#lastSimulationTime = simulationTime;
		
		return ret;
	}
}