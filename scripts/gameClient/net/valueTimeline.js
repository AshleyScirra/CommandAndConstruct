
// ValueTimeline is one of the key methods of client-side smoothing of network messages.
// Updates from the network essentially arrive at semi-random times, and may be in the
// wrong order. If the client just updated everything as network messages arrived, it
// would look very choppy and jerky over some networks. Instead network messages carry
// a timestamp of the current time on the server. Then values from these messages are
// inserted to a timeline, ordered by their timestamp (fixing any network reordering).
// The client then runs through the timeline on a delay, improving the chance values
// are received in advance of their being used, and allowing interpolation between them.
// ValueTimeline is a base class that provides a basic timeline and Add() method.
// There are two variants of timelines implemented in derived classes.
export class ValueTimeline {

	// The value timeline, as an array of objects with properties { timestamp, value }
	// which are sorted by their timestamp. Note this is a public property as derived
	// classes can't access private properties of a base class, but it is not meant to
	// be used by external callers.
	timeline = [];
	
	// Insert a value to the timeline at the given timestamp.
	Add(timestamp, value)
	{
		// Insert to the timeline as an object with two properties.
		const toInsert = { timestamp, value };
		
		// Search the timeline for the first existing entry with a higher timestamp.
		for (let i = 0, len = this.timeline.length; i < len; ++i)
		{
			if (this.timeline[i].timestamp > timestamp)
			{
				// Found the first existing entry with a higher timestamp: insert the new
				// entry just before the existing one. This maintains the sort order.
				this.timeline.splice(i, 0, toInsert);
				return;
			}
		}
		
		// If no existing entry has a higher timestamp, append the new entry at the end.
		this.timeline.push(toInsert);
	}
}