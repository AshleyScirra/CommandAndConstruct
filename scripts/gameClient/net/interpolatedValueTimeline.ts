
import { ValueTimeline } from "./valueTimeline.js";

import * as MathUtils from "../../utils/clientMathUtils.js";

type InterpolationType = "none" | "linear" | "angular";

// InterpolatedValueTimeline is derived from ValueTimeline as an interpolating variant.
// This is used for most values apart from positions (which use the stepped variant).
// When retrieving the value for a given time, this allows for looking for the previous
// and next values on the timeline around that given time, and then interpolating between
// them to estimate the value at the requested time. This allows the client to smoothly
// represent changes even from irregular network updates.
export class InterpolatedValueTimeline<ValueType = number> extends ValueTimeline<ValueType> {

	#interpolationType: InterpolationType;
	
	constructor(interpolationType: InterpolationType)
	{
		super();
		
		this.#interpolationType = interpolationType;
	}
	
	// Get an interpolated value at the given time.
	Get(simulationTime: number)
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
					return this.#Interpolate(prevEntry.value, entry.value, factor);
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
		return this.timeline.at(-1)!.value;
	}
	
	DeleteEntriesOlderThan(timestamp: number)
	{
		// Find the first entry newer than the given timestamp.
		for (let i = 0, len = this.timeline.length; i < len; ++i)
		{
			const entry = this.timeline[i];
			
			if (entry.timestamp > timestamp)
			{
				// All prior entries are older than the timestamp, so delete them.
				if (i > 0)
					this.timeline.splice(0, i);
				
				return;
			}
		}
		
		// All entries are older than the timestamp, so delete all but the last (newest) entry.
		this.timeline.splice(0, this.timeline.length - 1);
	}
	
	// Interpolate between two values using this timeline's interpolation mode.
	#Interpolate(a: ValueType, b: ValueType, x: number): ValueType
	{
		// If 'a' is an array, interpolate each element in the array.
		// This allows interpolating positions as [x, y].
		// TypeScript note: ValueType is generic and for InterpolatedValueTimeline, the only types
		// used are number and number[]. However TypeScript doesn't seem to have a good way to express
		// that ValueType is one of those two types. The code below is valid but doesn't pass type
		// checking because of this, so just use 'as ValueType' to force the type check to pass.
		if (Array.isArray(a) && Array.isArray(b))
		{
			return a.map((v, index) => this.#InterpolateSingleValue(v, b[index], x)) as ValueType;
		}
		else if (typeof a === "number" && typeof b === "number")
		{
			return this.#InterpolateSingleValue(a, b, x) as ValueType;
		}
		else
		{
			throw new TypeError("invalid interpolation types");
		}
	}
	
	#InterpolateSingleValue(a: number, b: number, x: number)
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