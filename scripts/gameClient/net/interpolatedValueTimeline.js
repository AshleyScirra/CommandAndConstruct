
import { ValueTimeline } from "./valueTimeline.js";

import * as MathUtils from "../../utils/clientMathUtils.js";

// InterpolatedValueTimeline is derived from ValueTimeline as an interpolating variant.
// This is used for most values apart from positions (which use the stepped variant).
// When retrieving the value for a given time, this allows for looking for the previous
// and next values on the timeline around that given time, and then interpolating between
// them to estimate the value at the requested time. This allows the client to smoothly
// represent changes even from irregular network updates.
export class InterpolatedValueTimeline extends ValueTimeline {

	#interpolationType;		// "none", "linear" or "angular"
	
	constructor(interpolationType)
	{
		super();
		
		this.#interpolationType = interpolationType;
	}
	
	// Get an interpolated value at the given time.
	Get(simulationTime)
	{
		// Search through the timeline (which is ordered by timestamp) for the first entry that has
		// a newer timestamp than the given time. This holds the destination value.
		for (let i = 0, len = this.timeline.length; i < len; ++i)
		{
			const entry = this.timeline[i];
			
			if (entry.timestamp > simulationTime)
			{
				// Found the first entry with a newer timestamp. However if this is the first entry
				// in the timeline, there is no previous value available, and so interpolation is
				// not possible. In this case just return the value with no interpolation.
				if (i === 0)
				{
					return entry.value;
				}
				else
				{
					// Find the previous entry, which holds the starting value.
					const prevEntry = this.timeline[i - 1];
					
					// Calculate the interpolation factor, i.e. the percentage of the way between the
					// two timeline entries the current time is at.
					const factor = (simulationTime - prevEntry.timestamp) / (entry.timestamp - prevEntry.timestamp);
					
					// Interpolate between the values using this timeline's interpolation mode.
					const ret = this.#Interpolate(prevEntry.value, entry.value, factor);
					
					// To avoid wasting memory, delete all timeline entries older than the previous entry,
					// as they are no longer needed.
					this.timeline.splice(0, i - 1);
					
					return ret;
				}
			}
		}
		
		// There is no timeline entry with a newer timestamp than the given time. This probably means
		// packet loss or late delivery has left the timeline empty ahead of the simulation time.
		// Unfortunately there is not much that can be done here other than return the last known value.
		// Forwards interpolation is potentially possible, but difficult under our protocol: if a
		// value has no subsequent updates, we don't know if that's because it stopped changing, or
		// if the network failed to deliver the next updates. In the prior case, forwards interpolation
		// is wrong, as it means overshooting the last value. Therefore forwards interpolation is
		// not currently attempted.
		// Since all timeline entries other than the last one are no longer useful, also delete them
		// to save memory. Note an interpolated timeline must always have at least one entry.
		if (this.timeline.length > 1)
		{
			this.timeline.splice(0, this.timeline.length - 1);
		}

		return this.timeline[0].value;
	}
	
	// Interpolate between two values using this timeline's interpolation mode.
	#Interpolate(a, b, x)
	{
		if (this.#interpolationType === "none")
		{
			// "none" just returns a, but if x >= 1 then it returns b.
			return (x < 1 ? a : b);
		}
		if (this.#interpolationType === "linear")
		{
			// standard linear interpolation
			return MathUtils.lerp(a, b, x);
		}
		else if (this.#interpolationType === "angular")
		{
			// angular interpolation, which correctly handles cycles
			return MathUtils.angleLerp(a, b, x);
		}
		else
		{
			throw new Error("invalid interpolation type");
		}
	}
}