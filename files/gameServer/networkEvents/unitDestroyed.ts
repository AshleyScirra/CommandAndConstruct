
import { NetworkEvent } from "./networkEvent.js";

// The UnitDestroyed event tells clients that a unit was destroyed.
NetworkEvent.UnitDestroyed = class UnitDestroyed extends NetworkEvent {
	
	#unitId;			// ID of unit that was destroyed
	
	constructor(unitId)
	{
		super();
		
		this.#unitId = unitId;
	}
	
	Write(dataView, pos)
	{
		// Event type
		dataView.setUint8(pos, NetworkEvent.TYPE_UNIT_DESTROYED);
		pos += 1;
		
		// Unit ID
		dataView.setUint16(pos, this.#unitId);
		pos += 2;
		
		return pos;
	}
}